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
export declare function performUnsubscribe(input: {
    http?: string;
    mailto?: string;
    oneClick: boolean;
}): Promise<UnsubscribeResult>;
/**
 * Allowlist check. We accept https:// URLs only, parse them strictly, and
 * reject obvious abuse:
 *   - non-https scheme
 *   - userinfo (e.g. `https://foo:bar@evil.com`)
 *   - any URL longer than 2048 chars
 *   - hostnames that resolve to private network ranges syntactically
 *     (127.0.0.1, 10.x, 172.16-31.x, 192.168.x, ::1, fc00::/7, etc.)
 */
export declare function isSafeHttpsTarget(raw: string): boolean;
//# sourceMappingURL=perform.d.ts.map