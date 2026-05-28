/**
 * IPC handler hardening.
 *
 * Two protections that every renderer-callable channel should opt into:
 *
 *   1. SENDER GUARD: refuse any invocation whose senderFrame isn't the
 *      main window's top frame. Defends against future `<webview>` or
 *      iframe injection escapes that would otherwise be able to call
 *      privileged main-process handlers.
 *
 *   2. INPUT VALIDATION: every channel that mutates state or hits the
 *      network parses its input through a `zod` schema. Failure returns
 *      a structured error object to the renderer and logs a SHAPE-ONLY
 *      breadcrumb (channel + arg keys, not values) so we can audit
 *      attempted abuse without ourselves leaking secrets.
 *
 * Usage:
 *
 *   safeHandle(IPC_CHANNELS.mailSend, MailSendSchema, async (ctx, input, evt) => {
 *     // input is fully validated and typed
 *   });
 *
 * For reads with no validation needed, use `safeHandle(channel, null, fn)`.
 */
import type { IpcMainInvokeEvent } from 'electron';
import type { ZodTypeAny, z } from 'zod';
/**
 * Called by the main bootstrap once the main BrowserWindow exists. We
 * remember its `webContents.id` so the sender guard has something concrete
 * to check against.
 */
export declare function bindMainWindowForIpc(webContentsId: number): void;
export interface IpcErrorEnvelope {
    ok: false;
    error: {
        code: string;
        message: string;
    };
}
export declare function isMainWindowSender(event: IpcMainInvokeEvent): boolean;
export interface SafeHandleLogger {
    warn: (...args: unknown[]) => void;
}
interface SafeHandleDeps {
    log?: SafeHandleLogger;
}
export declare function configureIpcGuards(deps: SafeHandleDeps): void;
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
export declare function safeHandle<S extends ZodTypeAny | null, R>(channel: string, schema: S, fn: (input: S extends ZodTypeAny ? z.infer<S> : undefined, event: IpcMainInvokeEvent) => Promise<R> | R): void;
/** Test-only helper to reset cached state between vitest runs. */
export declare function _resetIpcGuardsForTests(): void;
export {};
//# sourceMappingURL=guards.d.ts.map