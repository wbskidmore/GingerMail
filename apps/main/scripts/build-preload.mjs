// Bundles the Electron preload into a self-contained CommonJS file.
//
// The preload runs in a SANDBOXED renderer (webPreferences.sandbox = true),
// where the script must be CommonJS and may only `require('electron')` plus a
// small whitelist of builtins — it cannot `require` workspace packages such as
// `@gingermail/core`. `tsc` emits ESM (the package is `type: module`), which
// the sandbox rejects with "Cannot use import statement outside a module".
//
// So we bundle `src/preload.ts` → `dist/preload.cjs` (CJS, electron kept
// external, every other import inlined). `main.ts` loads `preload.cjs`; the
// ESM `dist/preload.js` that tsc also emits is simply unused.
import { build, context } from 'esbuild';
import path from 'node:path';

const cwd = process.cwd();
const isDev = process.env.GM_DEV === '1';

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(cwd, 'src', 'preload.ts')],
  outfile: path.join(cwd, 'dist', 'preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // `electron` is provided by the sandboxed preload runtime; everything else
  // (incl. @gingermail/core constants) gets inlined into the bundle.
  external: ['electron'],
  sourcemap: isDev ? 'inline' : false,
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[build-preload] watching src/preload.ts → dist/preload.cjs');
} else {
  await build(options);
  console.log('[build-preload] wrote dist/preload.cjs');
}
