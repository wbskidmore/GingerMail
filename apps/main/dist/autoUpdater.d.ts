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
export interface UpdaterController {
    /** Settings → Updates → Check now */
    checkNow(): Promise<{
        available: boolean;
        version?: string;
        notes?: string;
        error?: string;
    }>;
    /** Settings → Updates → Download (only legal after checkNow returned `available: true`). */
    downloadAndInstallOnQuit(): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** True when updates.optIn is currently true AND the runtime is a packaged build. */
    isActive(): boolean;
}
export interface SetupUpdaterDeps {
    log: Pick<Logger, 'info' | 'warn' | 'error'>;
    isOptedIn: () => boolean;
    isDev: boolean;
}
export declare function setupAutoUpdater(deps: SetupUpdaterDeps): UpdaterController;
//# sourceMappingURL=autoUpdater.d.ts.map