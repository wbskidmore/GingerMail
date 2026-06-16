/**
 * OAuth configuration, resolved in this precedence order:
 *
 *   1. process.env (dev: real shell vars, or `.env` loaded by loadEnv.ts)
 *   2. A baked `build-config.json` embedded next to this module at build time
 *      (see apps/main/scripts/gen-build-config.mjs). This is what lets a
 *      *packaged* app ship a built-in Google/Microsoft/Slack client so end
 *      users just hit "Sign in with Google" (the browser web-login) without
 *      configuring anything.
 *
 * When neither source provides a value, that OAuth provider is unavailable but
 * the rest of the app (IMAP/SMTP, POP3, Apple via app-specific password, AI,
 * Slack via a pasted token) still works.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface BuildConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
  microsoftTenant?: string;
  slackClientId?: string;
  slackClientSecret?: string;
}

let cached: BuildConfig | undefined;

/**
 * Read the build-time baked credentials, if present. The file is generated
 * into `dist/` at build time and sits next to the compiled `config.js`, so it
 * is packaged inside the app (asar) and resolvable via `import.meta.url`.
 */
function readBakedConfig(): Partial<BuildConfig> {
  try {
    const p = fileURLToPath(new URL('./build-config.json', import.meta.url));
    if (!existsSync(p)) return {};
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Partial<BuildConfig>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function nonEmpty(v: string | undefined): string | undefined {
  return v && v.length > 0 ? v : undefined;
}

export function getBuildConfig(): BuildConfig {
  if (cached) return cached;
  const baked = readBakedConfig();
  cached = {
    googleClientId: nonEmpty(process.env.GM_GOOGLE_CLIENT_ID) ?? nonEmpty(baked.googleClientId),
    googleClientSecret:
      nonEmpty(process.env.GM_GOOGLE_CLIENT_SECRET) ?? nonEmpty(baked.googleClientSecret),
    microsoftClientId:
      nonEmpty(process.env.GM_MICROSOFT_CLIENT_ID) ?? nonEmpty(baked.microsoftClientId),
    microsoftTenant:
      nonEmpty(process.env.GM_MICROSOFT_TENANT) ?? nonEmpty(baked.microsoftTenant) ?? 'common',
    slackClientId: nonEmpty(process.env.GM_SLACK_CLIENT_ID) ?? nonEmpty(baked.slackClientId),
    slackClientSecret:
      nonEmpty(process.env.GM_SLACK_CLIENT_SECRET) ?? nonEmpty(baked.slackClientSecret),
  };
  return cached;
}
