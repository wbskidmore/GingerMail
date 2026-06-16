// Bakes OAuth client credentials into the packaged app.
//
// config.ts reads process.env first, then falls back to dist/build-config.json.
// A packaged app has no process.env for these, so this script captures the
// build-time values (from the shell env or a repo-root `.env`) and writes them
// next to the compiled config.js. The result ships inside the asar, so end
// users get a working "Sign in with Google" web login without configuring
// anything.
//
// Note: a desktop ("Installed App") OAuth client secret is NOT a confidential
// secret per Google's own docs — the loopback + PKCE flow does not rely on it
// being hidden. Still, build-config.json lives under dist/ (gitignored) so it
// never lands in source control.
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd(); // apps/main when run via `pnpm --filter @gingermail/main build`
const distDir = path.join(cwd, 'dist');
const repoRoot = path.resolve(cwd, '..', '..');

// Pull values from a repo-root .env too, so a local baked build is one step.
function loadDotEnvInto(target) {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (target[key] === undefined) target[key] = val;
  }
}

const env = { ...process.env };
loadDotEnvInto(env);

const mapping = {
  googleClientId: env.GM_GOOGLE_CLIENT_ID,
  googleClientSecret: env.GM_GOOGLE_CLIENT_SECRET,
  microsoftClientId: env.GM_MICROSOFT_CLIENT_ID,
  microsoftTenant: env.GM_MICROSOFT_TENANT,
  slackClientId: env.GM_SLACK_CLIENT_ID,
  slackClientSecret: env.GM_SLACK_CLIENT_SECRET,
};

const baked = {};
for (const [key, value] of Object.entries(mapping)) {
  if (typeof value === 'string' && value.length > 0) baked[key] = value;
}

fs.mkdirSync(distDir, { recursive: true });
const outFile = path.join(distDir, 'build-config.json');
fs.writeFileSync(outFile, JSON.stringify(baked), 'utf8');

const bakedKeys = Object.keys(baked);
console.log(
  `[gen-build-config] wrote ${path.relative(repoRoot, outFile)} with keys: ${
    bakedKeys.length ? bakedKeys.join(', ') : '(none — no OAuth env vars set)'
  }`,
);
