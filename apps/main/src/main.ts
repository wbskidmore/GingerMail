import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import {
  app,
  BrowserWindow,
  log,
  nativeImage,
  nativeTheme,
  systemPreferences,
} from './electronShim.js';
import { AppContext } from './context.js';
import { registerIpc } from './ipc/register.js';
import { startOllamaSidecar, stopOllamaSidecar } from './ipc/aiHandlers.js';
import { startChatPolling, stopChatPolling, stopAllGateways } from './sync/chatSync.js';
import { setupAutoUpdater } from './autoUpdater.js';
import { applySecurityHardening } from './security/hardening.js';
import { installAiEgressFilter } from './security/aiEgress.js';
import { installConsoleScrubbing, wrapLoggerWithScrub } from './log/scrub.js';
import { bindMainWindowForIpc, configureIpcGuards } from './ipc/guards.js';

// Install secret-aware logging FIRST so nothing below us can accidentally
// leak a token to stdout / electron-log files / a future crash report.
installConsoleScrubbing();
wrapLoggerWithScrub(log);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// electron-log v5 split its API; `initialize` lives on the main entry only
// and isn't strictly required - skip it and just configure transports if
// the underlying Logger exposes them.
try {
  if (
    typeof (log as { initialize?: (opts: { preload: boolean }) => void }).initialize === 'function'
  ) {
    (log as { initialize: (opts: { preload: boolean }) => void }).initialize({ preload: true });
  }
  if (log.transports?.file) {
    log.transports.file.level = 'info';
  }
} catch (err) {
  console.warn('[gingermail] electron-log init skipped:', err);
}

const isDev = process.env.GM_DEV === '1';
const rendererUrl = process.env.GM_RENDERER_URL ?? 'http://localhost:5173';

const context = new AppContext();
let mainWindow: BrowserWindowType | null = null;

/**
 * Locate a `build/icon.*` file shipped alongside the app. In dev that's at
 * the repo root; in a packaged build electron-builder uses the .icns/.ico
 * automatically, but we still set BrowserWindow.icon on Win/Linux so taskbar
 * and Alt-Tab pick it up.
 */
function findIcon(): string | undefined {
  const candidates =
    process.platform === 'win32' ? ['build/icon.ico', 'build/icon.png'] : ['build/icon.png'];
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  for (const rel of candidates) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return undefined;
}

async function createWindow(): Promise<void> {
  await context.init();

  const accent = readAccentColor();
  log.info(
    `[main] os accent=${accent} theme=${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}`,
  );

  const iconPath = findIcon();
  // macOS uses .icns from the .app bundle; dev/Win/Linux take icon from the BrowserWindow.
  const iconImage =
    iconPath && process.platform !== 'darwin' ? nativeImage.createFromPath(iconPath) : undefined;

  if (process.platform === 'darwin' && app.dock && iconPath) {
    // In dev the .app bundle is the generic Electron one - force the dock icon
    // to ours so the dock and Cmd-Tab show the real GingerMail mark.
    try {
      app.dock.setIcon(nativeImage.createFromPath(iconPath));
    } catch (err) {
      log.warn('[main] could not set dock icon', err);
    }
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    show: false,
    icon: iconImage,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1d20' : '#faf9f7',
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    backgroundMaterial: process.platform === 'win32' ? 'mica' : undefined,
    webPreferences: {
      // Bundled CommonJS preload (see scripts/build-preload.mjs). A sandboxed
      // preload can't load the ESM preload.js that tsc emits.
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  applySecurityHardening(mainWindow, { rendererDevUrl: isDev ? rendererUrl : null });

  if (isDev) {
    await mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html'));
  }

  context.setMainWindow(mainWindow);
  bindMainWindowForIpc(mainWindow.webContents.id);
  configureIpcGuards({ log });
  // The updater is wired but opted-out by default; the renderer's
  // Settings → Updates card surfaces the toggle and the buttons.
  const updater = setupAutoUpdater({
    log,
    isDev,
    isOptedIn: () => Boolean(context.getSettings().updates?.optIn),
  });
  context.updater = updater;
  registerIpc(context);

  // AI egress allowlist. The filter is installed on the renderer's default
  // session and consults live settings on every request. Cloud AI calls
  // currently originate from the main process's global fetch (not the
  // renderer session), so this filter is defense-in-depth for any future
  // call-site that goes through the renderer.
  try {
    installAiEgressFilter(
      mainWindow.webContents.session,
      () => context.getSettings().ai,
      (info) => {
        log.warn(`[ai-egress] blocked host=${maskHost(info.url)} reason=${info.reason}`);
      },
      // Never block the renderer loading its own app shell. In dev that's the
      // Vite dev server origin; in prod the shell is file:// (not intercepted).
      isDev ? [new URL(rendererUrl).origin] : [],
    );
  } catch (err) {
    log.warn('[ai-egress] failed to install filter:', err);
  }

  // Spin up the bundled Ollama sidecar in the background. Failure is
  // non-fatal: the AI settings card surfaces lastError so the user can
  // troubleshoot, and every cloud / off feature keeps working.
  void startOllamaSidecar();

  // Background Slack polling: refreshes unread/mentions for connected
  // workspaces and fires (Focus-aware, batched) notifications. No-op when
  // no Slack account is connected or chat is disabled in settings.
  startChatPolling(context);

  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send(
      'app:themeChanged',
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    );
  });
}

function readAccentColor(): string {
  try {
    if (process.platform === 'darwin') {
      const sys = systemPreferences.getAccentColor?.() ?? '6366f1';
      return `#${sys.replace(/[^0-9a-f]/gi, '').slice(0, 6) || '6366f1'}`;
    }
    if (process.platform === 'win32') {
      const sys = systemPreferences.getAccentColor?.();
      return sys ? `#${sys.slice(0, 6)}` : '#6366f1';
    }
  } catch {
    /* ignore */
  }
  return '#6366f1';
}

app
  .whenReady()
  .then(createWindow)
  .catch((err) => {
    log.error('Failed to start main window', err);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  stopChatPolling();
  stopAllGateways();
  await Promise.allSettled([context.shutdown(), stopOllamaSidecar()]);
});

/**
 * Mask a URL down to its host (and only the host) so log lines from the
 * egress filter never carry path/query data that might contain a token or
 * a prompt fragment.
 */
function maskHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable)';
  }
}

export { readAccentColor };
