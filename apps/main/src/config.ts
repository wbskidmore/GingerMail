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
