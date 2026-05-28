// Dev entry: builds main process TS and launches electron pointing at the Vite dev server.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const tsc = spawn('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--watch'], { stdio: 'inherit', cwd });

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
  const env = { ...process.env, GM_DEV: '1', GM_RENDERER_URL: process.env.GM_RENDERER_URL ?? 'http://localhost:5173' };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = spawn(electronBin, ['.'], { stdio: 'inherit', cwd, env });
  electron.on('exit', (code) => {
    tsc.kill('SIGTERM');
    process.exit(code ?? 0);
  });
}

waitForBuild();
