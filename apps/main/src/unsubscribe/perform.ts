/**
 * We deliberately avoid importing the electron-log shim at module load
 * time so this file can be unit-tested under plain vitest (which doesn't
 * boot the Electron main process). Warnings go through console.warn in
 * that mode, and through electron-log when wired through the real shim.
 */
const log = {
  warn: (...args: unknown[]): void => console.warn(...args),
};

/**
 * Result of an attempted unsubscribe. `method` tells the UI what we
 * actually did: an HTTPS one-click POST, a mailto compose, or nothing
 * (when neither method was usable).
 */
export interface UnsubscribeResult {
  ok: boolean;
  method: 'http' | 'mailto' | 'none';
  error?: string;
}

/**
 * RFC 8058 one-click unsubscribe with paranoid safety rails:
 *   - HTTPS only (no http://, file://, javascript:, data:, etc.).
 *   - No automatic redirect to http:// targets.
 *   - 5-second hard timeout to defeat slow-bleed exfil endpoints.
 *   - POST body is exactly `List-Unsubscribe=One-Click` per RFC 8058.
 *   - Sends an inert User-Agent + omits referer.
 *
 * If a `mailto:` URL is present but no http one, we DON'T send the mail
 * ourselves \u2014 we hand back `method: 'mailto'` and let the renderer open
 * the composer pre-populated. Sending mail "silently" on the user's
 * behalf to addresses encoded in headers is exactly the kind of thing
 * that gets people unsubscribed from accounts they wanted to keep.
 */
export async function performUnsubscribe(input: {
  http?: string;
  mailto?: string;
  oneClick: boolean;
}): Promise<UnsubscribeResult> {
  if (input.http && input.oneClick && isSafeHttpsTarget(input.http)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(input.http, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': 'GingerMail-Unsubscribe/1.0',
          },
          body: 'List-Unsubscribe=One-Click',
          redirect: 'manual',
          signal: controller.signal,
        });
        // Manual redirect: treat 30x with a Location header as success only
        // if the new target is also HTTPS; otherwise refuse to follow.
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location') ?? '';
          if (!isSafeHttpsTarget(loc)) {
            return { ok: false, method: 'http', error: `Server tried to redirect to an unsafe URL (${loc.slice(0, 80)})` };
          }
          const follow = await fetch(loc, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click', redirect: 'manual', signal: controller.signal });
          return { ok: follow.ok || follow.status >= 200 && follow.status < 400, method: 'http' };
        }
        return { ok: res.ok, method: 'http', error: res.ok ? undefined : `HTTP ${res.status}` };
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('[unsubscribe] http failed:', msg);
      return { ok: false, method: 'http', error: msg };
    }
  }
  if (input.mailto) {
    // Return mailto info so the renderer can open the composer.
    return { ok: true, method: 'mailto' };
  }
  return { ok: false, method: 'none', error: 'No usable unsubscribe method.' };
}

/**
 * Allowlist check. We accept https:// URLs only, parse them strictly, and
 * reject obvious abuse:
 *   - non-https scheme
 *   - userinfo (e.g. `https://foo:bar@evil.com`)
 *   - any URL longer than 2048 chars
 *   - hostnames that resolve to private network ranges syntactically
 *     (127.0.0.1, 10.x, 172.16-31.x, 192.168.x, ::1, fc00::/7, etc.)
 */
export function isSafeHttpsTarget(raw: string): boolean {
  if (!raw || raw.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost') return false;
  if (host === '::1' || host === '[::1]') return false;
  // IPv4 ranges
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 0) return false;
  }
  // Crude IPv6 private-range filter; bracketed form retains the surrounding []
  const v6 = host.replace(/^\[|\]$/g, '');
  if (/^fc[0-9a-f]{2}:/i.test(v6) || /^fd[0-9a-f]{2}:/i.test(v6)) return false;
  if (/^fe80:/i.test(v6)) return false;
  return true;
}
