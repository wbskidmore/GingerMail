import { type AppSettings } from '@gingermail/core';
/**
 * Tiny JSON-on-disk preference store. We replaced electron-store@10 because
 * its index.js does `import electron from 'electron'` at the top of an ESM
 * module, which crashes Electron 32's main process Node 20.18 with a
 * CJS-from-ESM interop bug (https://github.com/electron/electron/issues/40751).
 *
 * Electron-store gave us almost nothing we don't already have here:
 * atomic write, schema defaults, and per-platform userData location.
 */
export interface PrefsShape {
    settings: AppSettings;
}
export interface PrefsStore {
    get<K extends keyof PrefsShape>(key: K, fallback: PrefsShape[K]): PrefsShape[K];
    set<K extends keyof PrefsShape>(key: K, value: PrefsShape[K]): void;
    readonly path: string;
}
export interface OpenPrefsOptions {
    /** Absolute directory where the prefs file should live. Caller passes `app.getPath('userData')`. */
    dir: string;
    /** Filename (without `.json`). Defaults to `gingermail-prefs`. */
    name?: string;
}
export declare function openPrefs(opts: OpenPrefsOptions): PrefsStore;
export declare function readSettings(store: PrefsStore): AppSettings;
export declare function writeSettings(store: PrefsStore, patch: Partial<AppSettings>): AppSettings;
//# sourceMappingURL=prefs.d.ts.map