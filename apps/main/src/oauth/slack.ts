import { randomUUID } from 'node:crypto';
import type { Account } from '@gingermail/core';
import { runLoopbackOAuth } from './loopback.js';

/**
 * User-token scopes requested by the BYO Slack OAuth flow. We request a
 * USER token (xoxp-…) - not a bot token - because GingerMail acts on behalf
 * of the signed-in human: it reads their DMs + channels and posts as them.
 *
 * Scope rationale (each maps to a feature, removing one disables it):
 *   - channels:read / groups:read / im:read / mpim:read : list conversations
 *   - *:history                                         : read message history
 *   - chat:write                                        : send messages
 *   - users:read / users:read.email                     : resolve names + label account
 */
export const SLACK_USER_SCOPES = [
  'channels:read',
  'groups:read',
  'im:read',
  'mpim:read',
  'channels:history',
  'groups:history',
  'im:history',
  'mpim:history',
  'chat:write',
  'users:read',
  'users:read.email',
];

export interface SlackAuthOutcome {
  account: Account;
  tokens: { access_token: string };
}

interface SlackOAuthAccessResponse {
  ok: boolean;
  error?: string;
  team?: { id?: string; name?: string };
  authed_user?: { id?: string; access_token?: string; scope?: string };
}

/**
 * Slack OAuth v2 (Installed App / Loopback flow). Requests a user token via
 * `user_scope`, validates a per-attempt `state` nonce on the loopback hop,
 * then exchanges the code at `oauth.v2.access`.
 */
export class SlackOAuthFlow {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async run(): Promise<SlackAuthOutcome> {
    const state = randomUUID();
    const { code, port } = await runLoopbackOAuth({
      timeoutMs: 5 * 60_000,
      expectedState: state,
      buildAuthUrl: (redirectUri) => {
        const params = new URLSearchParams({
          client_id: this.clientId,
          user_scope: SLACK_USER_SCOPES.join(','),
          redirect_uri: redirectUri,
          state,
        });
        return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
      },
    });

    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const res = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    const json = (await res.json()) as SlackOAuthAccessResponse;
    if (!json.ok || !json.authed_user?.access_token) {
      throw new Error(`Slack OAuth failed: ${json.error ?? 'no user token returned'}`);
    }
    const teamId = json.team?.id ?? 'workspace';
    const teamName = json.team?.name ?? 'Slack';
    return {
      account: {
        id: `slack:${teamId}`,
        kind: 'slack',
        displayName: teamName,
        emailAddress: `${json.authed_user.id ?? 'user'}@${teamId}.slack`,
        createdAt: Date.now(),
        syncIntervalSec: 120,
        enabled: true,
      },
      tokens: { access_token: json.authed_user.access_token },
    };
  }
}
