import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Mock the electronShim's ipcMain BEFORE importing guards.
const handlerStore = new Map<string, (event: unknown, raw: unknown) => unknown>();
vi.mock('../electronShim.js', () => ({
  ipcMain: {
    removeHandler: (ch: string) => handlerStore.delete(ch),
    handle: (ch: string, fn: (event: unknown, raw: unknown) => unknown) => handlerStore.set(ch, fn),
  },
}));

let guards: typeof import('./guards.js');

beforeEach(async () => {
  handlerStore.clear();
  guards = await import('./guards.js');
  guards._resetIpcGuardsForTests();
});

afterEach(() => {
  vi.resetModules();
});

function fakeEvent(senderId: number): unknown {
  return { sender: { id: senderId } };
}

describe('safeHandle', () => {
  it('rejects with SENDER_DENIED when the sender is not the main window', async () => {
    guards.bindMainWindowForIpc(42);
    guards.safeHandle('test:protected', null, async () => 'ok');
    const fn = handlerStore.get('test:protected')!;
    const out = await fn(fakeEvent(99), undefined);
    expect(out).toEqual({ ok: false, error: { code: 'SENDER_DENIED', message: 'Unauthorized IPC sender' } });
  });

  it('allows the main window through', async () => {
    guards.bindMainWindowForIpc(42);
    guards.safeHandle('test:allowed', null, async () => 'ok');
    const fn = handlerStore.get('test:allowed')!;
    expect(await fn(fakeEvent(42), undefined)).toBe('ok');
  });

  it('skips the sender guard before the main window is bound (boot path)', async () => {
    // pre-bind: every sender is allowed (no window exists yet).
    guards.safeHandle('test:boot', null, async () => 'booted');
    const fn = handlerStore.get('test:boot')!;
    expect(await fn(fakeEvent(7), undefined)).toBe('booted');
  });

  it('returns VALIDATION_FAILED when the input does not match the schema', async () => {
    guards.bindMainWindowForIpc(1);
    const schema = z.object({ email: z.string().email() });
    guards.safeHandle('test:val', schema, async (input) => input.email);
    const fn = handlerStore.get('test:val')!;
    const ok = await fn(fakeEvent(1), { email: 'a@b.com' });
    expect(ok).toBe('a@b.com');
    const bad = await fn(fakeEvent(1), { email: 'not-an-email' });
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('does not leak the raw payload into the warn log on validation failure', async () => {
    const warned: string[] = [];
    guards.configureIpcGuards({ log: { warn: (...a) => warned.push(a.join(' ')) } });
    guards.bindMainWindowForIpc(1);
    const schema = z.object({ key: z.string().min(40) });
    guards.safeHandle('test:secret', schema, async () => 'never');
    const fn = handlerStore.get('test:secret')!;
    await fn(fakeEvent(1), { key: 'sk-this-is-the-leaked-token' });
    const joined = warned.join('\n');
    expect(joined).not.toContain('sk-this-is-the-leaked-token');
    expect(joined).toMatch(/key:string/); // shape, not value
  });
});
