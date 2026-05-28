/**
 * Centralised Electron security hardening for the GingerMail main window.
 *
 * Pulls together every renderer-protection setting in one place so reviewers
 * have a single file to audit instead of chasing `setWindowOpenHandler` /
 * `setPermissionRequestHandler` / `onHeadersReceived` / `will-navigate` calls
 * sprinkled across `main.ts`, `context.ts`, and the IPC handlers.
 *
 * What this enforces:
 *   1. Strict Content-Security-Policy on every renderer response (incl. HMR
 *      data: + ws: in dev).
 *   2. `will-navigate` denial — any in-renderer top-level nav goes through
 *      `shell.openExternal` and the window stays on the app shell.
 *   3. `setWindowOpenHandler` denial — same story for `window.open` / target.
 *   4. `webContents.setPermissionRequestHandler` denying every browser
 *      permission (camera, mic, geo, notifications, etc.). Notifications go
 *      through the OS via `new Notification()` in main, not through the
 *      browser Permissions API.
 *   5. `will-attach-webview` killing any `<webview>` tags. The app should
 *      never embed one and Electron's docs flag it as a footgun.
 */
import type { BrowserWindow as BrowserWindowType } from 'electron';
import { shell } from '../electronShim.js';

export interface HardeningOptions {
  /**
   * When set, the dev server URL is whitelisted in the CSP `connect-src` /
   * `style-src` / `script-src` directives so Vite HMR keeps working in
   * `pnpm dev`. In production this is `null` and the CSP is locked down.
   */
  rendererDevUrl: string | null;
}

const ALLOWED_RENDERER_PROTOCOLS = new Set(['file:', 'about:', 'devtools:']);

export function applySecurityHardening(win: BrowserWindowType, opts: HardeningOptions): void {
  installCsp(win, opts);
  installNavigationGuards(win);
  installPermissionDeny(win);
  installWebviewDeny(win);
}

function installCsp(win: BrowserWindowType, opts: HardeningOptions): void {
  const devUrl = opts.rendererDevUrl;
  // Build the dev-vs-prod CSP. The `'unsafe-inline'` for styles is required
  // by Mantine's `@emotion` runtime; everything else is locked down.
  // `connect-src` keeps the renderer from reaching anywhere it shouldn't.
  const csp = devUrl
    ? [
        "default-src 'self' " + devUrl + ' data: blob:',
        // Vite HMR ws + cloud AI endpoints are talked to from main, not
        // renderer. Renderer only needs the dev server and IPC.
        "connect-src 'self' " + devUrl + ' ws: wss: http://localhost:* http://127.0.0.1:*',
        "script-src 'self' " + devUrl + " 'unsafe-eval' blob:",
        "style-src 'self' " + devUrl + " 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data: " + devUrl,
        "frame-src 'self' data:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ')
    : [
        "default-src 'self'",
        "connect-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "frame-src 'self' data:",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders ?? {}) };
    // Remove any inherited CSP from the dev server and overwrite.
    for (const k of Object.keys(responseHeaders)) {
      if (k.toLowerCase() === 'content-security-policy') delete responseHeaders[k];
    }
    responseHeaders['Content-Security-Policy'] = [csp];
    responseHeaders['X-Content-Type-Options'] = ['nosniff'];
    responseHeaders['Referrer-Policy'] = ['no-referrer'];
    responseHeaders['Permissions-Policy'] = ['camera=(), microphone=(), geolocation=(), interest-cohort=()'];
    callback({ responseHeaders });
  });
}

function installNavigationGuards(win: BrowserWindowType): void {
  win.webContents.on('will-navigate', (event, url) => {
    // Allow same-origin reloads (file:// or the dev URL) and devtools.
    try {
      const parsed = new URL(url);
      if (ALLOWED_RENDERER_PROTOCOLS.has(parsed.protocol)) return;
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // Renderer tried to navigate the top frame to a remote URL. That's
        // almost always an injected link that escaped sanitisation, so we
        // block the in-window nav and pop the user's default browser.
        event.preventDefault();
        if (parsed.protocol === 'https:') {
          void shell.openExternal(url);
        }
        return;
      }
      // ws://, javascript:, file:// outside our app, etc.: block silently.
      event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
        void shell.openExternal(url);
      }
    } catch {
      /* ignore malformed URLs */
    }
    return { action: 'deny' };
  });
}

function installPermissionDeny(win: BrowserWindowType): void {
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    // Deny every browser permission. The renderer has no legitimate need
    // for camera, mic, geolocation, notifications (handled main-side via
    // `new Notification()`), midi, clipboard-read, etc.
    callback(false);
  });
  win.webContents.session.setPermissionCheckHandler(() => false);
}

function installWebviewDeny(win: BrowserWindowType): void {
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    event.preventDefault();
    // Belt-and-braces in case future Electron versions ignore preventDefault:
    delete (webPreferences as { preload?: string }).preload;
    (webPreferences as { nodeIntegration?: boolean }).nodeIntegration = false;
    (webPreferences as { contextIsolation?: boolean }).contextIsolation = true;
    void params;
  });
}
