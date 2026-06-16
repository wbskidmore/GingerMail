/**
 * Build-time OAuth configuration.
 *
 * Populate these via environment variables at build / dev time:
 *   GM_GOOGLE_CLIENT_ID
 *   GM_GOOGLE_CLIENT_SECRET
 *   GM_MICROSOFT_CLIENT_ID
 *   GM_SLACK_CLIENT_ID
 *   GM_SLACK_CLIENT_SECRET
 *
 * When unset, OAuth providers are unavailable but the rest of the app
 * (IMAP/SMTP, POP3, Apple via app-specific password, AI, Slack via a
 * pasted token) still works.
 */
// #region agent log
import { existsSync as _existsSync } from 'node:fs';
// #endregion

export interface BuildConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
  microsoftTenant?: string;
  slackClientId?: string;
  slackClientSecret?: string;
}

let cached: BuildConfig | undefined;

export function getBuildConfig(): BuildConfig {
  // #region agent log
  try {
    const wasCached = !!cached;
    const _cwd = process.cwd();
    const _envCwd = _existsSync(_cwd + '/.env');
    const _envUp = _existsSync(_cwd + '/../../.env');
    const gid = process.env.GM_GOOGLE_CLIENT_ID;
    const gsec = process.env.GM_GOOGLE_CLIENT_SECRET;
    fetch('http://127.0.0.1:7282/ingest/00add4d2-85ba-45df-8ed2-ee74835f8d96', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd77297' },
      body: JSON.stringify({
        sessionId: 'd77297',
        hypothesisId: 'A,B,C,D',
        location: 'apps/main/src/config.ts:getBuildConfig',
        message: 'getBuildConfig invoked',
        data: {
          wasCached,
          cwd: _cwd,
          envFileAtCwd: _envCwd,
          envFileAtRepoRoot: _envUp,
          googleIdType: typeof gid,
          googleIdLen: typeof gid === 'string' ? gid.length : -1,
          googleSecretType: typeof gsec,
          googleSecretLen: typeof gsec === 'string' ? gsec.length : -1,
          msIdPresent: !!process.env.GM_MICROSOFT_CLIENT_ID,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
  // #endregion
  if (cached) return cached;
  cached = {
    googleClientId: process.env.GM_GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GM_GOOGLE_CLIENT_SECRET,
    microsoftClientId: process.env.GM_MICROSOFT_CLIENT_ID,
    microsoftTenant: process.env.GM_MICROSOFT_TENANT ?? 'common',
    slackClientId: process.env.GM_SLACK_CLIENT_ID,
    slackClientSecret: process.env.GM_SLACK_CLIENT_SECRET,
  };
  return cached;
}
