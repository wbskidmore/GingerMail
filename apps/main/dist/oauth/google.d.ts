import type { Account } from '@gingermail/core';
export interface GoogleAuthOutcome {
    account: Account;
    tokens: {
        access_token: string;
        refresh_token?: string;
        expiry_date?: number;
    };
}
/**
 * Google OAuth (Installed App / Loopback flow) with:
 *   - PKCE S256: code_challenge sent on /authorize, code_verifier sent on
 *     /token exchange. Defeats authorization-code interception on the
 *     loopback hop.
 *   - State nonce: per-attempt random UUID, validated by the loopback
 *     server before the code is ever forwarded.
 *   - Scope minimization: see `GOOGLE_SCOPES` for the per-scope rationale.
 *
 * Production note: the loopback redirect port is ephemeral; never re-used
 * across attempts.
 */
export declare class GoogleOAuthFlow {
    private readonly clientId;
    private readonly clientSecret;
    constructor(clientId: string, clientSecret: string);
    run(): Promise<GoogleAuthOutcome>;
}
//# sourceMappingURL=google.d.ts.map