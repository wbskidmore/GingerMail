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
export interface HardeningOptions {
    /**
     * When set, the dev server URL is whitelisted in the CSP `connect-src` /
     * `style-src` / `script-src` directives so Vite HMR keeps working in
     * `pnpm dev`. In production this is `null` and the CSP is locked down.
     */
    rendererDevUrl: string | null;
}
export declare function applySecurityHardening(win: BrowserWindowType, opts: HardeningOptions): void;
//# sourceMappingURL=hardening.d.ts.map