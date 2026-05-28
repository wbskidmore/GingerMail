export interface LoopbackResult {
    code: string;
    state?: string;
    port: number;
}
export interface LoopbackOptions {
    buildAuthUrl: (redirectUri: string) => string | Promise<string>;
    /**
     * Expected `state` value. The server REJECTS any callback whose `state`
     * query param does not match this exact string. Required for production
     * use; supplying `undefined` is only acceptable in tests / single-step
     * flows that don't issue a CSRF-protectable state nonce.
     */
    expectedState?: string;
    timeoutMs?: number;
    successHtml?: string;
}
/**
 * Localhost OAuth callback receiver.
 *
 * Hardening rules (all enforced here, not in the per-provider flow):
 *   - Binds 127.0.0.1 only (never 0.0.0.0).
 *   - Only honours requests whose path is exactly `/callback`. Anything else
 *     (favicon scan, browser pre-render, attacker probe) gets 404.
 *   - Requires the `state` param to match the expected nonce. Mismatch =>
 *     400 + reject(); we never forward the code to the token exchange.
 *   - Refuses to forward `code` more than once (one-shot listener).
 *   - Success page uses history.replaceState to scrub `?code=…&state=…` out
 *     of the user's browser URL bar (and history) immediately on load.
 */
export declare function runLoopbackOAuth(opts: LoopbackOptions): Promise<LoopbackResult>;
//# sourceMappingURL=loopback.d.ts.map