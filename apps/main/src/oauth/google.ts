import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getGoogleApis } from '../electronShim.js';
import { runLoopbackOAuth } from './loopback.js';
import { GOOGLE_SCOPES } from '@gingermail/providers';
import type { Account } from '@gingermail/core';

export interface GoogleAuthOutcome {
  account: Account;
  tokens: { access_token: string; refresh_token?: string; expiry_date?: number };
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
export class GoogleOAuthFlow {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async run(): Promise<GoogleAuthOutcome> {
    const { google } = getGoogleApis();
    const state = randomUUID();
    const codeVerifier = base64UrlEncode(randomBytes(32));
    const codeChallenge = base64UrlEncode(createHash('sha256').update(codeVerifier).digest());

    const { code, port } = await runLoopbackOAuth({
      timeoutMs: 5 * 60_000,
      expectedState: state,
      buildAuthUrl: (redirectUri) => {
        const client = new google.auth.OAuth2({
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          redirectUri,
        });
        return client.generateAuthUrl({
          access_type: 'offline',
          scope: GOOGLE_SCOPES,
          prompt: 'consent',
          state,
          // googleapis@>=128 supports PKCE via these two opts.
          code_challenge_method: 'S256' as unknown as undefined,
          code_challenge: codeChallenge as unknown as string,
        } as Parameters<typeof client.generateAuthUrl>[0] & {
          code_challenge_method?: string;
          code_challenge?: string;
        });
      },
    });
    const client = new google.auth.OAuth2({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: `http://127.0.0.1:${port}/callback`,
    });
    const { tokens } = await client.getToken({
      code,
      codeVerifier,
    } as Parameters<typeof client.getToken>[0]);
    client.setCredentials(tokens);
    const oauth2v2 = google.oauth2({ version: 'v2', auth: client });
    const profile = await oauth2v2.userinfo.get();
    const email = profile.data.email ?? '';
    return {
      account: {
        id: `gmail:${email || randomUUID()}`,
        kind: 'gmail',
        displayName: profile.data.name ?? email,
        emailAddress: email,
        createdAt: Date.now(),
        syncIntervalSec: 120,
        enabled: true,
      },
      tokens: {
        access_token: tokens.access_token ?? '',
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
      },
    };
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
