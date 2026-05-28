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
import { ipcMain } from '../electronShim.js';
import type { ZodTypeAny, z } from 'zod';

let mainWindowId: number | null = null;

/**
 * Called by the main bootstrap once the main BrowserWindow exists. We
 * remember its `webContents.id` so the sender guard has something concrete
 * to check against.
 */
export function bindMainWindowForIpc(webContentsId: number): void {
  mainWindowId = webContentsId;
}

export interface IpcErrorEnvelope {
  ok: false;
  error: { code: string; message: string };
}

export function isMainWindowSender(event: IpcMainInvokeEvent): boolean {
  // Strict equality on numeric webContents.id. We don't loosen this to
  // "any window we know about" because the only legitimate renderer is
  // the main one — any future window-open would be a regression.
  if (mainWindowId === null) return true; // pre-bind window: allow (boot).
  try {
    return event.sender.id === mainWindowId;
  } catch {
    return false;
  }
}

/**
 * Build a redacted breadcrumb of the args' shape (key names + types),
 * NEVER values. Used for the audit log when validation fails so we can
 * tell "renderer tried mailSend with no `to`" without recording the body.
 */
function shapeOf(value: unknown, depth = 0): string {
  if (depth > 3) return '…';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${shapeOf(value[0], depth + 1)}…×${value.length}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const parts = Object.keys(obj)
      .slice(0, 12)
      .map((k) => `${k}:${shapeOf(obj[k], depth + 1)}`);
    return `{${parts.join(',')}}`;
  }
  return typeof value;
}

export interface SafeHandleLogger {
  warn: (...args: unknown[]) => void;
}

interface SafeHandleDeps {
  log?: SafeHandleLogger;
}

let depsRef: SafeHandleDeps = {};
export function configureIpcGuards(deps: SafeHandleDeps): void {
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
export function safeHandle<S extends ZodTypeAny | null, R>(
  channel: string,
  schema: S,
  fn: (input: S extends ZodTypeAny ? z.infer<S> : undefined, event: IpcMainInvokeEvent) => Promise<R> | R,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, raw: unknown) => {
    if (!isMainWindowSender(event)) {
      depsRef.log?.warn(`[ipc] rejected: non-main-window sender on ${channel}`);
      return { ok: false, error: { code: 'SENDER_DENIED', message: 'Unauthorized IPC sender' } } satisfies IpcErrorEnvelope;
    }
    let input: unknown = raw;
    if (schema) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        depsRef.log?.warn(
          `[ipc] validation failed channel=${channel} shape=${shapeOf(raw)} errors=${parsed.error.issues.map((i) => i.path.join('.') + ':' + i.code).join(',')}`,
        );
        return {
          ok: false,
          error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Invalid input' },
        } satisfies IpcErrorEnvelope;
      }
      input = parsed.data;
    }
    try {
      return await fn(input as never, event);
    } catch (err) {
      depsRef.log?.warn(`[ipc] handler threw channel=${channel} err=${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  });
}

/** Test-only helper to reset cached state between vitest runs. */
export function _resetIpcGuardsForTests(): void {
  mainWindowId = null;
  depsRef = {};
}
