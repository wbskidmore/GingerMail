import { ipcMain } from '../electronShim.js';
let mainWindowId = null;
/**
 * Called by the main bootstrap once the main BrowserWindow exists. We
 * remember its `webContents.id` so the sender guard has something concrete
 * to check against.
 */
export function bindMainWindowForIpc(webContentsId) {
    mainWindowId = webContentsId;
}
export function isMainWindowSender(event) {
    // Strict equality on numeric webContents.id. We don't loosen this to
    // "any window we know about" because the only legitimate renderer is
    // the main one — any future window-open would be a regression.
    if (mainWindowId === null)
        return true; // pre-bind window: allow (boot).
    try {
        return event.sender.id === mainWindowId;
    }
    catch {
        return false;
    }
}
/**
 * Build a redacted breadcrumb of the args' shape (key names + types),
 * NEVER values. Used for the audit log when validation fails so we can
 * tell "renderer tried mailSend with no `to`" without recording the body.
 */
function shapeOf(value, depth = 0) {
    if (depth > 3)
        return '…';
    if (value === null)
        return 'null';
    if (value === undefined)
        return 'undefined';
    if (Array.isArray(value)) {
        if (value.length === 0)
            return '[]';
        return `[${shapeOf(value[0], depth + 1)}…×${value.length}]`;
    }
    if (typeof value === 'object') {
        const obj = value;
        const parts = Object.keys(obj)
            .slice(0, 12)
            .map((k) => `${k}:${shapeOf(obj[k], depth + 1)}`);
        return `{${parts.join(',')}}`;
    }
    return typeof value;
}
let depsRef = {};
export function configureIpcGuards(deps) {
    depsRef = deps;
}
/**
 * Register a hardened IPC handler. The handler receives the parsed input
 * (or `undefined` when no schema was provided).
 *
 * If the schema validation fails OR the sender guard rejects, we return
 * an `IpcErrorEnvelope` instead of throwing — throwing in `ipcMain.handle`
 * propagates a stringified error to the renderer which (a) leaks the
 * stack and (b) collapses to a generic "error invoking ..." message that
 * isn't actionable. The envelope lets the renderer branch cleanly.
 */
export function safeHandle(channel, schema, fn) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, raw) => {
        if (!isMainWindowSender(event)) {
            depsRef.log?.warn(`[ipc] rejected: non-main-window sender on ${channel}`);
            return { ok: false, error: { code: 'SENDER_DENIED', message: 'Unauthorized IPC sender' } };
        }
        let input = raw;
        if (schema) {
            const parsed = schema.safeParse(raw);
            if (!parsed.success) {
                depsRef.log?.warn(`[ipc] validation failed channel=${channel} shape=${shapeOf(raw)} errors=${parsed.error.issues.map((i) => i.path.join('.') + ':' + i.code).join(',')}`);
                return {
                    ok: false,
                    error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Invalid input' },
                };
            }
            input = parsed.data;
        }
        try {
            return await fn(input, event);
        }
        catch (err) {
            depsRef.log?.warn(`[ipc] handler threw channel=${channel} err=${err instanceof Error ? err.message : String(err)}`);
            throw err;
        }
    });
}
/** Test-only helper to reset cached state between vitest runs. */
export function _resetIpcGuardsForTests() {
    mainWindowId = null;
    depsRef = {};
}
//# sourceMappingURL=guards.js.map