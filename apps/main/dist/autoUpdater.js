import { getElectronUpdater } from './electronShim.js';
export function setupAutoUpdater(deps) {
    const { log, isOptedIn, isDev } = deps;
    if (isDev) {
        log.info('[updater] dev mode — auto-updater disabled');
        return inactiveController(log);
    }
    let updater;
    try {
        ({ autoUpdater: updater } = getElectronUpdater());
    }
    catch (err) {
        log.warn('[updater] electron-updater not available:', err);
        return inactiveController(log);
    }
    updater.logger = log;
    // PRINCIPLE: no behavior happens without an explicit user click.
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    // Disable the public-pre-release fallback that would otherwise let a
    // hostile feed advertise an "older" version as the latest.
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
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
                if (!v)
                    return { available: false };
                if (v === '0.0.0-killswitch') {
                    return { available: false, error: 'This build has been retired by the publisher. Please reinstall from gingermail.app.' };
                }
                return { available: true, version: v, notes: typeof result?.updateInfo?.releaseNotes === 'string' ? result.updateInfo.releaseNotes : undefined };
            }
            catch (err) {
                return { available: false, error: err instanceof Error ? err.message : String(err) };
            }
        },
        downloadAndInstallOnQuit: async () => {
            if (!isOptedIn())
                return { ok: false, error: 'Updates are opted out in Settings.' };
            try {
                await updater.downloadUpdate();
                return { ok: true };
            }
            catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) };
            }
        },
    };
}
function inactiveController(log) {
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
//# sourceMappingURL=autoUpdater.js.map