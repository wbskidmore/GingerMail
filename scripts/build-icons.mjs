#!/usr/bin/env node
/**
 * Regenerate the GingerMail icon set from `build/icon.png` (1024x1024).
 *
 * Outputs:
 *   build/icon.png            (copy of the source)
 *   build/icon.iconset/*.png  (Apple iconset, normalised to sRGB)
 *   build/icon.icns           (macOS, via `iconutil`)
 *   build/icon.ico            (Windows, via `png-to-ico`)
 *
 * Usage:
 *   1. Drop a new 1024x1024 PNG at `build/icon.png` (or pass --src=path).
 *   2. Run `node scripts/build-icons.mjs`.
 *
 * Requires macOS (`sips` + `iconutil`) and the workspace's `png-to-ico` dev
 * dependency.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const iconsetDir = path.join(buildDir, 'icon.iconset');
const defaultSrc = path.join(buildDir, 'icon.png');

const srcArg = process.argv.find((a) => a.startsWith('--src='));
const src = srcArg ? path.resolve(srcArg.slice('--src='.length)) : defaultSrc;

if (!existsSync(src)) {
  console.error(`[build-icons] source not found: ${src}`);
  process.exit(1);
}

mkdirSync(buildDir, { recursive: true });
rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

function sips(...args) {
  const r = spawnSync('sips', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`[build-icons] sips failed: ${args.join(' ')}\n${r.stderr.toString()}`);
    process.exit(1);
  }
}

// Always re-encode the source through sips into a real PNG. The macOS image
// pickers (and Cursor's clipboard-to-disk) frequently save what is actually a
// JPEG under a .png extension, which then trips up anything that magic-sniffs
// (electron-builder is fine but Linux desktop integrations are not). Routing
// through sips into a tmp directory and moving into place gives us a
// guaranteed-PNG `build/icon.png`.
const tmpDir = path.join(buildDir, '.iconsrc');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
sips('-s', 'format', 'png', src, '--out', tmpDir);
const sipsOut = path.join(tmpDir, path.basename(src, path.extname(src)) + '.png');
copyFileSync(sipsOut, defaultSrc);
rmSync(tmpDir, { recursive: true, force: true });

const sizes = [16, 32, 64, 128, 256, 512, 1024];
for (const size of sizes) {
  sips(
    '-z',
    String(size),
    String(size),
    src,
    '--out',
    path.join(iconsetDir, `icon_${size}x${size}.png`),
  );
}

const renames = [
  ['icon_32x32.png', 'icon_16x16@2x.png'],
  ['icon_64x64.png', 'icon_32x32@2x.png'],
  ['icon_256x256.png', 'icon_128x128@2x.png'],
  ['icon_512x512.png', 'icon_256x256@2x.png'],
  ['icon_1024x1024.png', 'icon_512x512@2x.png'],
];
for (const [from, to] of renames) {
  copyFileSync(path.join(iconsetDir, from), path.join(iconsetDir, to));
}
// The bare 64 + 1024 sizes aren't part of the Apple iconset spec.
rmSync(path.join(iconsetDir, 'icon_64x64.png'), { force: true });
rmSync(path.join(iconsetDir, 'icon_1024x1024.png'), { force: true });

// iconutil refuses PNGs with non-sRGB color profiles. Re-export each.
const srgb = '/System/Library/ColorSync/Profiles/sRGB Profile.icc';
if (existsSync(srgb)) {
  for (const file of [
    'icon_16x16.png',
    'icon_16x16@2x.png',
    'icon_32x32.png',
    'icon_32x32@2x.png',
    'icon_128x128.png',
    'icon_128x128@2x.png',
    'icon_256x256.png',
    'icon_256x256@2x.png',
    'icon_512x512.png',
    'icon_512x512@2x.png',
  ]) {
    const p = path.join(iconsetDir, file);
    sips('--matchTo', srgb, '-s', 'format', 'png', p, '--out', p);
  }
}

const icnsOut = path.join(buildDir, 'icon.icns');
const icns = spawnSync('iconutil', ['-c', 'icns', '-o', icnsOut, iconsetDir], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (icns.status !== 0) {
  console.error(`[build-icons] iconutil failed:\n${icns.stderr.toString()}`);
  process.exit(1);
}

// Windows .ico via png-to-ico (CJS module, may need .default on ESM import).
const mod = await import('png-to-ico');
const pngToIco = mod.default || mod;
const icoSources = ['icon_256x256.png', 'icon_128x128.png', 'icon_32x32.png', 'icon_16x16.png']
  .map((n) => path.join(iconsetDir, n))
  .filter((p) => existsSync(p));
const icoBuf = await pngToIco(icoSources);
writeFileSync(path.join(buildDir, 'icon.ico'), icoBuf);

// Mirror the source PNG into the renderer's public/ dir so the in-app title
// bar (and any other UI surface) can display the same icon at runtime via a
// stable `./icon.png` URL. Created on demand; safe to overwrite.
const rendererPublic = path.join(repoRoot, 'apps', 'renderer', 'public');
mkdirSync(rendererPublic, { recursive: true });
copyFileSync(defaultSrc, path.join(rendererPublic, 'icon.png'));

console.log(
  '[build-icons] wrote build/icon.png, build/icon.icns, build/icon.ico, apps/renderer/public/icon.png',
);
