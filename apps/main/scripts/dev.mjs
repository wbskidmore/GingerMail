// Dev entry: builds main process TS and launches electron pointing at the Vite dev server.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cwd = process.cwd();

// Bust any stale compiled output BEFORE starting the watch build. Without this,
// `tsc -b`'s incremental cache (.tsbuildinfo) can decide nothing changed and
// keep an old `dist/`, and `waitForBuild()` below would then launch Electron
// against that stale `dist/main.js` (it only checks existence, not freshness).
// The net effect was Electron repeatedly booting pre-edit code after a pull.
// Deleting the cache + entry forces a full rebuild and makes the launch gate
// wait for freshly-emitted output.
for (const stale of ['dist/.tsbuildinfo', 'dist/main.js', 'dist/preload.cjs']) {
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

// The sandboxed preload must be a CommonJS bundle, not the ESM that tsc emits.
// esbuild rebuilds dist/preload.cjs on every change; the launch gate below
// waits for it so Electron never boots without a working IPC bridge.
const preload = spawn('node', ['scripts/build-preload.mjs', '--watch'], {
  stdio: 'inherit',
  cwd,
  env: { ...process.env, GM_DEV: '1' },
});

// Resolve the real Electron executable (electron.exe on Windows, the Electron
// binary elsewhere) via the npm package, which exports the absolute path to it.
// Spawning the node_modules/.bin/electron.cmd shim directly throws spawn EINVAL
// on Windows since Node's CVE-2024-27980 fix refuses to spawn .cmd/.bat without
// shell:true.
const electronBin = require('electron');
function waitForBuild(attempts = 60) {
  const ready =
    existsSync(path.join(cwd, 'dist', 'main.js')) &&
    existsSync(path.join(cwd, 'dist', 'preload.cjs'));
  if (ready) launch();
  else if (attempts > 0) setTimeout(() => waitForBuild(attempts - 1), 500);
  else {
    console.error('[gingermail main] main.js / preload.cjs never built; exiting');
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
  // #region agent log
  fetch('http://127.0.0.1:7282/ingest/00add4d2-85ba-45df-8ed2-ee74835f8d96',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b7b699'},body:JSON.stringify({sessionId:'b7b699',runId:'post-fix',hypothesisId:'A',location:'dev.mjs:65',message:'about to spawn electron',data:{platform:process.platform,electronBin:String(electronBin),endsWithCmd:String(electronBin).toLowerCase().endsWith('.cmd')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const electron = spawn(electronBin, ['.'], { stdio: 'inherit', cwd, env });
  // #region agent log
  electron.on('spawn',()=>{fetch('http://127.0.0.1:7282/ingest/00add4d2-85ba-45df-8ed2-ee74835f8d96',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b7b699'},body:JSON.stringify({sessionId:'b7b699',runId:'post-fix',hypothesisId:'C',location:'dev.mjs:65',message:'electron spawned OK',data:{pid:electron.pid},timestamp:Date.now()})}).catch(()=>{});});
  electron.on('error',(err)=>{fetch('http://127.0.0.1:7282/ingest/00add4d2-85ba-45df-8ed2-ee74835f8d96',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b7b699'},body:JSON.stringify({sessionId:'b7b699',runId:'post-fix',hypothesisId:'C',location:'dev.mjs:65',message:'electron spawn error',data:{code:err&&err.code,errno:err&&err.errno,syscall:err&&err.syscall},timestamp:Date.now()})}).catch(()=>{});});
  // #endregion
  electron.on('exit', (code) => {
    tsc.kill('SIGTERM');
    preload.kill('SIGTERM');
    process.exit(code ?? 0);
  });
}

waitForBuild();
