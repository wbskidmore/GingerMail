import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isSafeHttpsTarget, performUnsubscribe } from './perform.js';

describe('isSafeHttpsTarget', () => {
  it('accepts plain https URLs', () => {
    expect(isSafeHttpsTarget('https://example.com/u/abc')).toBe(true);
    expect(isSafeHttpsTarget('https://mail.example.com/unsubscribe?id=123')).toBe(true);
  });

  it('rejects non-https schemes', () => {
    expect(isSafeHttpsTarget('http://example.com/u')).toBe(false);
    expect(isSafeHttpsTarget('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpsTarget('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpsTarget('data:text/html,<script>')).toBe(false);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(isSafeHttpsTarget('https://foo:bar@evil.com/')).toBe(false);
  });

  it('rejects private/loopback IPs', () => {
    expect(isSafeHttpsTarget('https://127.0.0.1/u')).toBe(false);
    expect(isSafeHttpsTarget('https://10.0.0.5/u')).toBe(false);
    expect(isSafeHttpsTarget('https://192.168.1.1/u')).toBe(false);
    expect(isSafeHttpsTarget('https://172.16.0.1/u')).toBe(false);
    expect(isSafeHttpsTarget('https://169.254.0.1/u')).toBe(false);
    expect(isSafeHttpsTarget('https://localhost/u')).toBe(false);
  });

  it('rejects IPv6 link-local and ULA ranges', () => {
    expect(isSafeHttpsTarget('https://[fc00::1]/u')).toBe(false);
    expect(isSafeHttpsTarget('https://[fe80::1]/u')).toBe(false);
  });

  it('rejects garbage / too-long inputs', () => {
    expect(isSafeHttpsTarget('')).toBe(false);
    expect(isSafeHttpsTarget('not a url')).toBe(false);
    expect(isSafeHttpsTarget('https://example.com/' + 'a'.repeat(3000))).toBe(false);
  });
});

describe('performUnsubscribe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns method=none when no method available', async () => {
    const r = await performUnsubscribe({ oneClick: false });
    expect(r).toEqual({ ok: false, method: 'none', error: 'No usable unsubscribe method.' });
  });

  it('returns method=mailto without sending mail when only mailto is present', async () => {
    const r = await performUnsubscribe({ mailto: 'mailto:foo@bar.com', oneClick: false });
    expect(r).toEqual({ ok: true, method: 'mailto' });
  });

  it('refuses to POST to non-https targets even when oneClick is set', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 200 }));
    const r = await performUnsubscribe({ http: 'http://insecure.example.com/u', oneClick: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.method).toBe('none');
  });

  it('POSTs the canonical body and reports success on 200', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 200 }));
    const r = await performUnsubscribe({ http: 'https://safe.example.com/u', oneClick: true });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://safe.example.com/u');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('List-Unsubscribe=One-Click');
    expect(r.ok).toBe(true);
    expect(r.method).toBe('http');
  });

  it('refuses to follow redirects to insecure URLs', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('', { status: 302, headers: { Location: 'http://insecure.example.com/u' } }),
      );
    const r = await performUnsubscribe({ http: 'https://safe.example.com/u', oneClick: true });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(r.ok).toBe(false);
    expect(r.method).toBe('http');
  });
});
