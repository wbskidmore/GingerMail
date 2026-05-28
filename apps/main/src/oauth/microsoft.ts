import { randomUUID } from 'node:crypto';
import { getMsalNode } from '../electronShim.js';
import { runLoopbackOAuth } from './loopback.js';
import { MICROSOFT_SCOPES } from '@gingermail/providers';
import type { Account } from '@gingermail/core';

export interface MicrosoftAuthOutcome {
  account: Account;
  tokens: { access_token: string; refresh_token?: string; expires_on?: number; home_account_id?: string };
}

export class MicrosoftOAuthFlow {
  constructor(private readonly clientId: string, private readonly tenant = 'common') {}

  async run(): Promise<MicrosoftAuthOutcome> {
    const { PublicClientApplication, CryptoProvider } = getMsalNode();
    const pca = new PublicClientApplication({
      auth: { clientId: this.clientId, authority: `https://login.microsoftonline.com/${this.tenant}` },
    });
    const cryptoProvider = new CryptoProvider();
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const state = randomUUID();

    const { code, port } = await runLoopbackOAuth({
      timeoutMs: 5 * 60_000,
      expectedState: state,
      buildAuthUrl: async (redirectUri) =>
        pca.getAuthCodeUrl({
          scopes: MICROSOFT_SCOPES,
          redirectUri,
          codeChallenge: challenge,
          codeChallengeMethod: 'S256',
          state,
        }),
    });

    const tokenResult = await pca.acquireTokenByCode({
      code,
      scopes: MICROSOFT_SCOPES,
      redirectUri: `http://127.0.0.1:${port}/callback`,
      codeVerifier: verifier,
    });
    if (!tokenResult) throw new Error('Microsoft OAuth: empty token result');

    return {
      account: {
        id: `microsoft:${tokenResult.account?.username ?? randomUUID()}`,
        kind: 'microsoft',
        displayName: tokenResult.account?.name ?? tokenResult.account?.username ?? '',
        emailAddress: tokenResult.account?.username ?? '',
        createdAt: Date.now(),
        syncIntervalSec: 120,
        enabled: true,
      },
      tokens: {
        access_token: tokenResult.accessToken,
        expires_on: tokenResult.expiresOn?.getTime(),
        home_account_id: tokenResult.account?.homeAccountId,
      },
    };
  }
}
