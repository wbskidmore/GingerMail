#!/usr/bin/env node
/**
 * Build-time helper that downloads the platform-specific Ollama binary,
 * verifies it against a pinned SHA-256, and drops it under
 * `apps/main/resources/ollama/` so electron-builder's `extraResources` rule
 * can copy it into the packaged app's Resources directory.
 *
 * Usage:
 *   node scripts/fetch-ollama.mjs                # current platform/arch
 *   node scripts/fetch-ollama.mjs --all          # every supported target
 *   node scripts/fetch-ollama.mjs --platform=darwin --arch=arm64
 *
 * The script exits 0 if the binary is already present and its SHA matches
 * (so re-running on a clean checkout is fast). On checksum mismatch it
 * deletes the cached file and exits non-zero so CI fails loudly.
 *
 * SHA-256 sums come from the GitHub release page for the pinned version.
 * Update OLLAMA_VERSION + SHA_BY_TARGET together; mismatch is treated as
 * tampering, not a typo.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Bump these two together. Get fresh sums from
// https://github.com/ollama/ollama/releases/download/<version>/sha256sum.txt
const OLLAMA_VERSION = 'v0.5.4';

const SHA_BY_TARGET = {
  // SHAs are PLACEHOLDERS — overwrite from the upstream sha256sum.txt
  // before the first packaged release. The script will refuse to write a
  // binary that doesn't match these, so an incorrect placeholder is loud,
  // not silent.
  'darwin-arm64': 'PLACEHOLDER_DARWIN_ARM64_SHA256',
  'darwin-x64': 'PLACEHOLDER_DARWIN_X64_SHA256',
  'win32-x64': 'PLACEHOLDER_WIN32_X64_SHA256',
  'linux-x64': 'PLACEHOLDER_LINUX_X64_SHA256',
};

const URL_BY_TARGET = {
  // macOS Ollama distributes as a `.tgz` with the ollama binary inside.
  // For simplicity we fetch the static `ollama-darwin` binary instead.
  'darwin-arm64': `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-darwin`,
  'darwin-x64': `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-darwin`,
  'win32-x64': `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-windows-amd64.exe`,
  'linux-x64': `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/ollama-linux-amd64`,
};

const FILE_BY_TARGET = {
  'darwin-arm64': 'ollama',
  'darwin-x64': 'ollama',
  'win32-x64': 'ollama.exe',
  'linux-x64': 'ollama',
};

function parseArgs(argv) {
  const out = { all: false, platform: process.platform, arch: process.arch };
  for (const a of argv.slice(2)) {
    if (a === '--all') out.all = true;
    else if (a.startsWith('--platform=')) out.platform = a.slice('--platform='.length);
    else if (a.startsWith('--arch=')) out.arch = a.slice('--arch='.length);
  }
  return out;
}

function targetKey(platform, arch) {
  return `${platform}-${arch}`;
}

/**
 * Resolve the expected SHA-256 for a target. A verified digest can be injected
 * via env (e.g. OLLAMA_SHA256_DARWIN_ARM64) so CI can pin the real upstream
 * value without committing it prematurely. A value still set to a
 * `PLACEHOLDER_*` sentinel is treated as "not pinned" (compliance POA&M
 * PM-009 / SR-11).
 */
function resolveExpectedSha(key) {
  const envName = `OLLAMA_SHA256_${key.replace(/-/g, '_').toUpperCase()}`;
  const fromEnv = process.env[envName];
  const candidate = fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : SHA_BY_TARGET[key];
  if (!candidate || /^PLACEHOLDER/i.test(candidate)) return null;
  return candidate.toLowerCase();
}

async function sha256File(file) {
  const buf = await readFile(file);
  const h = createHash('sha256');
  h.update(buf);
  return h.digest('hex');
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function downloadTo(url, dest) {
  console.log(`[ollama] downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = createWriteStream(dest);
    const reader = res.body.getReader();
    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) {
          out.end(() => resolve());
          return;
        }
        out.write(Buffer.from(value), (e) => (e ? reject(e) : pump()));
      }, reject);
    }
    pump();
  });
}

async function fetchOne(platform, arch) {
  const key = targetKey(platform, arch);
  const url = URL_BY_TARGET[key];
  const filename = FILE_BY_TARGET[key];
  if (!url || !filename) {
    console.warn(`[ollama] skipping unsupported target ${key}`);
    return;
  }
  const expectedSha = resolveExpectedSha(key);
  if (!expectedSha) {
    // Fail BEFORE downloading rather than fetching an unverifiable binary.
    throw new Error(
      `[ollama] no verified SHA-256 pinned for ${key}. Set ` +
        `OLLAMA_SHA256_${key.replace(/-/g, '_').toUpperCase()} or update ` +
        `SHA_BY_TARGET from the upstream sha256sum.txt before packaging ` +
        `(compliance POA&M PM-009).`,
    );
  }
  const destDir = path.join(ROOT, 'apps', 'main', 'resources', 'ollama', key);
  const destFile = path.join(destDir, filename);
  if (await exists(destFile)) {
    const have = await sha256File(destFile);
    if (have === expectedSha) {
      console.log(`[ollama] cache hit ${key} (sha ok)`);
      return;
    }
    console.warn(`[ollama] cached binary checksum mismatch (${have} vs ${expectedSha}); re-downloading`);
    await rm(destFile, { force: true });
  }

  await downloadTo(url, destFile);
  const got = await sha256File(destFile);
  if (got !== expectedSha) {
    await rm(destFile, { force: true });
    throw new Error(
      `[ollama] SHA-256 mismatch for ${key}: expected ${expectedSha} got ${got}. ` +
        `Update SHA_BY_TARGET if you intentionally bumped OLLAMA_VERSION.`,
    );
  }
  // Drop a sibling .version file electron-builder can read at runtime.
  await writeFile(path.join(destDir, 'VERSION'), OLLAMA_VERSION);
  // Ensure the macOS / linux binaries are executable.
  if (platform !== 'win32') {
    try {
      const { chmod } = await import('node:fs/promises');
      await chmod(destFile, 0o755);
    } catch (e) {
      console.warn('[ollama] could not chmod +x:', e);
    }
  }
  console.log(`[ollama] wrote ${path.relative(ROOT, destFile)} (sha ok)`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.all) {
    for (const key of Object.keys(URL_BY_TARGET)) {
      const [plat, arch] = key.split('-');
      try {
        await fetchOne(plat, arch);
      } catch (e) {
        console.error(e);
        process.exitCode = 1;
      }
    }
  } else {
    await fetchOne(args.platform, args.arch);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
