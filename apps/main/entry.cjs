// CommonJS entry shim for Electron.
//
// Two Electron-32-specific quirks force this shim:
//
// 1. Electron 32 ships Node 20.18.x with a CJS-from-ESM interop bug: any
//    `import 'electron'` (or other native module) statically reachable from
//    an ESM main file crashes inside `cjsPreparseModuleExports` before user
//    code can run. See https://github.com/electron/electron/issues/40751
//
// 2. Electron only intercepts `require('electron')` in CJS contexts; calling
//    it through `createRequire(import.meta.url)` from an ESM module returns
//    the path to the binary (a string) instead of the real module API.
//
// To satisfy both, we keep this shim as CJS, eagerly `require` everything
// Electron-flavoured here (where interception works), stash the live module
// objects on `globalThis`, then dynamic-import the ESM main entry.
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const electron = require('electron');
const electronLog = require('electron-log');
const log = electronLog && electronLog.default ? electronLog.default : electronLog;

const g = globalThis;
g.__gmElectron = electron;
g.__gmElectronLog = log;
g.__gmGetElectronUpdater = () => require('electron-updater');
g.__gmGetGoogleApis = () => require('googleapis');
g.__gmGetMsalNode = () => require('@azure/msal-node');
// Provider-CJS modules (better-sqlite3, imapflow, tsdav, nodemailer,
// @microsoft/microsoft-graph-client) live in their own workspace packages and
// are required there directly via createRequire - those modules aren't
// Electron-intercepted, so a plain CJS require inside ESM works fine for them.

const target = path.join(__dirname, 'dist', 'main.js');
import(pathToFileURL(target).href).catch((err) => {
  // Use the real electron-log if it loaded, otherwise fall back to console.
  try {
    log.error('[gingermail] failed to load ESM main:', err);
  } catch {
    console.error('[gingermail] failed to load ESM main:', err);
  }
  process.exit(1);
});
