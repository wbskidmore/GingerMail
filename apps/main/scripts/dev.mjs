// Dev entry: builds main process TS and launches electron pointing at the Vite dev server.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

// Bust any stale compiled output BEFORE starting the watch build. Without this,
// `tsc -b`'s incremental cache (.tsbuildinfo) can decide nothing changed and
// keep an old `dist/`, and `waitForBuild()` below would then launch Electron
// against that stale `dist/main.js` (it only checks existence, not freshness).
// The net effect was Electron repeatedly booting pre-edit code after a pull.
// Deleting the cache + entry forces a full rebuild and makes the launch gate
// wait for freshly-emitted output.
for (const stale of ['dist/.tsbuildinfo', 'dist/main.js']) {
  try {
    rmSync(path.join(cwd, stale), { force: true });
  } catch {
    /* best-effort; a missing file is fine */
  }
}
// Use build mode (`tsc -b`) so the referenced workspace packages
// (@gingermail/core, providers, ai, storage) are compiled in dependency
// order before main. Plain `tsc -p` does not build references, so on a
// fresh checkout it fails with TS2307 "Cannot find module" and never emits
// dist/main.js.
const tsc = spawn('pnpm', ['exec', 'tsc', '-b', 'tsconfig.json', '--watch'], {
  stdio: 'inherit',
  cwd,
});

const electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron';
function waitForBuild(attempts = 60) {
  if (existsSync(path.join(cwd, 'dist', 'main.js'))) launch();
  else if (attempts > 0) setTimeout(() => waitForBuild(attempts - 1), 500);
  else {
    console.error('[gingermail main] main.js never built; exiting');
    process.exit(1);
  }
}

function launch() {
  // Cursor and some shells export ELECTRON_RUN_AS_NODE=1, which forces the
  // Electron binary to run as a plain Node.js process - no `process.type`,
  // no `require('electron')` interception, no app boot. Strip it from the
  // spawn env so Electron starts as a real desktop process.
  const env = {
    ...process.env,
    GM_DEV: '1',
    GM_RENDERER_URL: process.env.GM_RENDERER_URL ?? 'http://localhost:5173',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = spawn(electronBin, ['.'], { stdio: 'inherit', cwd, env });
  electron.on('exit', (code) => {
    tsc.kill('SIGTERM');
    process.exit(code ?? 0);
  });
}

waitForBuild();
