import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LoopbackModule from './loopback.js';

// Mock the electron shell.openExternal before importing the loopback module
// — we don't want a real browser to pop during tests.
const openedUrls: string[] = [];
vi.mock('../electronShim.js', () => ({
  shell: {
    openExternal: async (u: string) => {
      openedUrls.push(u);
    },
  },
}));

let runLoopbackOAuth: typeof LoopbackModule.runLoopbackOAuth;

beforeEach(async () => {
  openedUrls.length = 0;
  ({ runLoopbackOAuth } = await import('./loopback.js'));
});

afterEach(() => {
  vi.resetModules();
});

async function fetchCallback(redirect: string, qs: string): Promise<{ status: number; body: string }> {
  const url = redirect.replace('/callback', `/callback${qs}`);
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
}

function redirectFromOpenedUrl(): string {
  const last = openedUrls.at(-1) ?? '';
  const u = new URL(last);
  return u.searchParams.get('redirect_uri') ?? '';
}

/**
 * The loopback's reject() fires synchronously from inside the HTTP server
 * callback. If we only attach a `.rejects.toThrow()` AFTER `fetch()` awaits,
 * vitest sometimes sees the rejection before the assertion attaches and
 * treats it as an unhandled error. We attach a no-op `.catch()` immediately
 * to claim the rejection, then assert via a captured deferred.
 */
function capture(p: Promise<unknown>): { reason: () => unknown } {
  let reason: unknown;
  p.then(
    (v) => { reason = { ok: v }; },
    (e) => { reason = e; },
  );
  return { reason: () => reason };
}

describe('runLoopbackOAuth', () => {
  it('rejects when state does not match the expected nonce', async () => {
    const p = runLoopbackOAuth({
      expectedState: 'correct-nonce',
      timeoutMs: 3000,
      buildAuthUrl: (redirect) => `https://example.com/authorize?redirect_uri=${encodeURIComponent(redirect)}&state=correct-nonce`,
    });
    const captured = capture(p);
    await vi.waitFor(() => expect(openedUrls.length).toBe(1));
    const redirect = redirectFromOpenedUrl();
    const res = await fetchCallback(redirect, '?code=ABC&state=wrong-nonce');
    expect(res.status).toBe(400);
    expect(res.body).toMatch(/state mismatch/i);
    await vi.waitFor(() => expect(captured.reason()).toBeInstanceOf(Error));
    expect(String(captured.reason())).toMatch(/state mismatch/i);
  });

  it('rejects callbacks at paths other than /callback', async () => {
    const p = runLoopbackOAuth({
      expectedState: 'n1',
      timeoutMs: 3000,
      buildAuthUrl: (redirect) => `https://example.com/authorize?redirect_uri=${encodeURIComponent(redirect)}`,
    });
    const captured = capture(p);
    await vi.waitFor(() => expect(openedUrls.length).toBe(1));
    const redirect = redirectFromOpenedUrl();
    const probe = await fetch(redirect.replace('/callback', '/something-else?code=x&state=n1'));
    expect(probe.status).toBe(404);
    const ok = await fetchCallback(redirect, '?code=valid-code&state=n1');
    expect(ok.status).toBe(200);
    await vi.waitFor(() => expect(captured.reason()).toEqual({ ok: expect.objectContaining({ code: 'valid-code', state: 'n1' }) }));
  });

  it('resolves with code + state when both match', async () => {
    const p = runLoopbackOAuth({
      expectedState: 'matchme',
      timeoutMs: 3000,
      buildAuthUrl: (redirect) => `https://example.com/authorize?redirect_uri=${encodeURIComponent(redirect)}`,
    });
    const captured = capture(p);
    await vi.waitFor(() => expect(openedUrls.length).toBe(1));
    const redirect = redirectFromOpenedUrl();
    const res = await fetchCallback(redirect, '?code=THE_CODE&state=matchme');
    expect(res.status).toBe(200);
    expect(res.body).toMatch(/Signed in/);
    await vi.waitFor(() => expect(captured.reason()).toEqual({ ok: expect.objectContaining({ code: 'THE_CODE', state: 'matchme' }) }));
  });

  it('rejects on OAuth error responses without invoking the token exchange', async () => {
    const p = runLoopbackOAuth({
      expectedState: 'n2',
      timeoutMs: 3000,
      buildAuthUrl: (redirect) => `https://example.com/authorize?redirect_uri=${encodeURIComponent(redirect)}`,
    });
    const captured = capture(p);
    await vi.waitFor(() => expect(openedUrls.length).toBe(1));
    const redirect = redirectFromOpenedUrl();
    await fetchCallback(redirect, '?error=access_denied');
    await vi.waitFor(() => expect(captured.reason()).toBeInstanceOf(Error));
    expect(String(captured.reason())).toMatch(/access_denied/);
  });
});
