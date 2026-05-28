/**
 * Secret-aware log scrubber.
 *
 * Production rule: nothing that looks like an API key, OAuth token,
 * Authorization header, or session cookie reaches stdout, electron-log
 * files, or any future telemetry pipeline. We accept some false positives
 * (truncating opaque base64-ish strings) in exchange for never leaking a
 * real secret because of a misplaced `console.log` in a retry loop.
 *
 * The scrubber is conservative: it operates on the stringified form of
 * every argument and only redacts well-known shapes. It does NOT try to
 * be a generic PII redactor.
 *
 * Patterns we redact:
 *   - `Authorization: Bearer <token>` and `Authorization: Basic <b64>`
 *   - `x-api-key: <token>` / `x-goog-api-key: <token>` / `api-key: <token>`
 *   - `?access_token=…` and `?api_key=…` in URLs (query + fragment)
 *   - Bare `sk-…` / `pk-…` (OpenAI), `xoxb-…` (Slack), `AIza…` (Google),
 *     `eyJ…` followed by another base64-ish chunk (JWT-ish), and any
 *     hex strings over 32 chars (which usually means an API key).
 *   - Anything inside a `password:` / `client_secret:` / `refresh_token:`
 *     pair, JSON or YAML-style.
 *
 * Tests live alongside in `scrub.test.ts`.
 */
export declare function scrubSecrets(input: unknown): string;
/**
 * Wrap an electron-log-style logger so every method scrubs its args before
 * delegating. We keep the same shape so callers don't need to change.
 * Console is also rerouted because some upstream libs (googleapis, msal,
 * better-sqlite3) write directly to `console.warn` on retry.
 */
export interface MinimalLogger {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
}
export declare function wrapLoggerWithScrub<T extends MinimalLogger>(logger: T): T;
export declare function installConsoleScrubbing(): void;
//# sourceMappingURL=scrub.d.ts.map