import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal, zero-dependency `.env` loader for development.
 *
 * The OAuth client IDs/secrets in apps/main/src/config.ts are read from
 * `process.env`. `.env.example` and CONTRIBUTING.md tell contributors to copy
 * it to `.env`, but nothing was ever wired up to actually read that file, so a
 * filled-in `.env` was silently ignored and OAuth always reported "not
 * configured". This walks up from the current working directory to find the
 * nearest `.env` and populates `process.env` for any keys not already set
 * (real shell / packaged-build env always wins).
 */
export function loadDotEnv(startDir: string = process.cwd()): void {
  const envPath = findEnvFile(startDir);
  if (!envPath) return;

  let raw: string;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Do not clobber values already provided by the real environment.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function findEnvFile(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
