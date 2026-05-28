import { shell } from '../electronShim.js';
const ALLOWED_RENDERER_PROTOCOLS = new Set(['file:', 'about:', 'devtools:']);
export function applySecurityHardening(win, opts) {
    installCsp(win, opts);
    installNavigationGuards(win);
    installPermissionDeny(win);
    installWebviewDeny(win);
}
function installCsp(win, opts) {
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
            if (k.toLowerCase() === 'content-security-policy')
                delete responseHeaders[k];
        }
        responseHeaders['Content-Security-Policy'] = [csp];
        responseHeaders['X-Content-Type-Options'] = ['nosniff'];
        responseHeaders['Referrer-Policy'] = ['no-referrer'];
        responseHeaders['Permissions-Policy'] = ['camera=(), microphone=(), geolocation=(), interest-cohort=()'];
        callback({ responseHeaders });
    });
}
function installNavigationGuards(win) {
    win.webContents.on('will-navigate', (event, url) => {
        // Allow same-origin reloads (file:// or the dev URL) and devtools.
        try {
            const parsed = new URL(url);
            if (ALLOWED_RENDERER_PROTOCOLS.has(parsed.protocol))
                return;
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
        }
        catch {
            event.preventDefault();
        }
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
                void shell.openExternal(url);
            }
        }
        catch {
            /* ignore malformed URLs */
        }
        return { action: 'deny' };
    });
}
function installPermissionDeny(win) {
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
        // Deny every browser permission. The renderer has no legitimate need
        // for camera, mic, geolocation, notifications (handled main-side via
        // `new Notification()`), midi, clipboard-read, etc.
        callback(false);
    });
    win.webContents.session.setPermissionCheckHandler(() => false);
}
function installWebviewDeny(win) {
    win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
        event.preventDefault();
        // Belt-and-braces in case future Electron versions ignore preventDefault:
        delete webPreferences.preload;
        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        void params;
    });
}
//# sourceMappingURL=hardening.js.map