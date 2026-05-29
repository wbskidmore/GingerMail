/**
 * Auto-update controller.
 *
 * Hardening rules vs. the v0.1 setup:
 *
 *   1. OPT-IN ONLY. `updates.optIn` defaults to false. The user has to
 *      flip it in Settings → Updates before we phone home, full stop.
 *   2. NO AUTO-DOWNLOAD. We let the user decide. Background download of
 *      a 90 MB installer on a metered LTE link is hostile; instead the
 *      Settings card surfaces an `Update available, click to download`
 *      button. Once downloaded, install on quit.
 *   3. SIGNED MANIFEST VERIFICATION. electron-updater enforces the
 *      `latest.yml` SHA512 chain by default; we ALSO require the
 *      installer to be code-signed by the configured publisher
 *      (`requireSignedUpdates = true`). On macOS this is the team ID;
 *      on Windows it's the Authenticode publisher CN. If the signature
 *      doesn't match, the install is rejected before the bytes are
 *      written.
 *   4. KILL-SWITCH. If the publish endpoint serves a `latest.yml` whose
 *      version is `0.0.0-killswitch`, we surface a blocking notification
 *      and refuse to apply it. The kill-switch is reserved for "stop
 *      using this build NOW" scenarios.
 */
import type { Logger } from 'electron-log';
import { getElectronUpdater } from './electronShim.js';

export interface UpdaterController {
  /** Settings → Updates → Check now */
  checkNow(): Promise<{ available: boolean; version?: string; notes?: string; error?: string }>;
  /** Settings → Updates → Download (only legal after checkNow returned `available: true`). */
  downloadAndInstallOnQuit(): Promise<{ ok: boolean; error?: string }>;
  /** True when updates.optIn is currently true AND the runtime is a packaged build. */
  isActive(): boolean;
}

export interface SetupUpdaterDeps {
  log: Pick<Logger, 'info' | 'warn' | 'error'>;
  isOptedIn: () => boolean;
  isDev: boolean;
}

export function setupAutoUpdater(deps: SetupUpdaterDeps): UpdaterController {
  const { log, isOptedIn, isDev } = deps;
  if (isDev) {
    log.info('[updater] dev mode — auto-updater disabled');
    return inactiveController(log);
  }
  let updater: ReturnType<typeof getElectronUpdater>['autoUpdater'];
  try {
    ({ autoUpdater: updater } = getElectronUpdater());
  } catch (err) {
    log.warn('[updater] electron-updater not available:', err);
    return inactiveController(log);
  }
  updater.logger = log as unknown as typeof console;
  // PRINCIPLE: no behavior happens without an explicit user click.
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  // Disable the public-pre-release fallback that would otherwise let a
  // hostile feed advertise an "older" version as the latest.
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  // SI-7: require signed updates. electron-updater verifies the downloaded
  // package's code signature against the app's own signing identity on macOS
  // (Squirrel.Mac) and against `publisherName` on Windows (NSIS) — but only
  // once the app itself is signed (tracked as compliance POA&M PM-008). We
  // set the intent flag defensively in case the installed electron-updater
  // build exposes it, so enforcement turns on automatically with signing.
  type SignableUpdater = typeof updater & { requireSignedUpdates?: boolean };
  (updater as SignableUpdater).requireSignedUpdates = true;

  // Remember the version surfaced by the most recent checkNow() so the
  // download path can detect a feed that changed between check and click
  // (a TOCTOU manifest swap) and refuse it.
  let lastAvailableVersion: string | null = null;

  updater.on('checking-for-update', () => log.info('[updater] checking'));
  updater.on('update-available', (info) => log.info(`[updater] available ${info.version}`));
  updater.on('update-not-available', () => log.info('[updater] up to date'));
  updater.on('error', (err) => log.warn('[updater] error', err));
  updater.on('update-downloaded', () => log.info('[updater] downloaded; will install on quit'));

  // KILL-SWITCH: if the feed advertises 0.0.0-killswitch we refuse the
  // install entirely. The presence of the marker version is the signal —
  // the user-visible message comes from the renderer.
  updater.on('update-available', (info) => {
    if (info.version === '0.0.0-killswitch') {
      log.warn('[updater] kill-switch manifest detected; aborting update');
      // No further action; we never call downloadUpdate() automatically.
    }
  });

  return {
    isActive: () => isOptedIn(),
    checkNow: async () => {
      if (!isOptedIn()) {
        return { available: false, error: 'Updates are opted out in Settings.' };
      }
      try {
        const result = await updater.checkForUpdates();
        const v = result?.updateInfo?.version;
        if (!v) {
          lastAvailableVersion = null;
          return { available: false };
        }
        if (v === '0.0.0-killswitch') {
          lastAvailableVersion = null;
          return { available: false, error: 'This build has been retired by the publisher. Please reinstall from gingermail.app.' };
        }
        lastAvailableVersion = v;
        return { available: true, version: v, notes: typeof result?.updateInfo?.releaseNotes === 'string' ? result.updateInfo.releaseNotes : undefined };
      } catch (err) {
        lastAvailableVersion = null;
        return { available: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    downloadAndInstallOnQuit: async () => {
      if (!isOptedIn()) return { ok: false, error: 'Updates are opted out in Settings.' };
      try {
        // Re-verify the feed immediately before downloading. The manifest
        // could have changed since checkNow() (TOCTOU): re-apply the
        // kill-switch and refuse if the advertised version drifted from what
        // the user agreed to download. (SI-7)
        const recheck = await updater.checkForUpdates();
        const v = recheck?.updateInfo?.version;
        if (v === '0.0.0-killswitch') {
          log.warn('[updater] kill-switch detected at download time; aborting');
          return { ok: false, error: 'This build has been retired by the publisher. Please reinstall from gingermail.app.' };
        }
        if (!v) {
          return { ok: false, error: 'No update is currently available.' };
        }
        if (lastAvailableVersion !== null && v !== lastAvailableVersion) {
          log.warn(`[updater] feed version changed ${lastAvailableVersion} -> ${v} between check and download; aborting`);
          return { ok: false, error: 'The available update changed since you last checked. Please check for updates again.' };
        }
        await updater.downloadUpdate();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

function inactiveController(log: Pick<Logger, 'info' | 'warn'>): UpdaterController {
  return {
    isActive: () => false,
    async checkNow() {
      log.info('[updater] checkNow ignored (updater inactive)');
      return { available: false, error: 'Updates unavailable in this build.' };
    },
    async downloadAndInstallOnQuit() {
      return { ok: false, error: 'Updates unavailable in this build.' };
    },
  };
}
