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
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// #region agent log
function __gmDebugLog(hypothesisId, message, data) {
  const payload = {
    sessionId: '1f347e',
    hypothesisId,
    location: 'apps/main/entry.cjs',
    message,
    data,
    timestamp: Date.now(),
    runId: process.env.GM_DEBUG_RUN_ID || 'runtime',
  };
  try {
    fetch('http://127.0.0.1:7282/ingest/00add4d2-85ba-45df-8ed2-ee74835f8d96', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1f347e' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    fs.appendFileSync(
      '/Users/blake.skidmore/Documents/GitHub/GingerMail2/.cursor/debug-1f347e.log',
      JSON.stringify(payload) + '\n',
    );
  } catch {
    /* packaged app may lack this path */
  }
}
try {
  const candidates = [
    path.join(__dirname, 'node_modules', 'electron-log'),
    path.join(__dirname, '..', '..', 'node_modules', 'electron-log'),
    path.join(
      __dirname,
      'node_modules',
      '.pnpm',
      'electron-log@5.4.4',
      'node_modules',
      'electron-log',
    ),
  ];
  const probe = candidates.map((p) => {
    let exists = false;
    let isSymlink = false;
    let linkTarget = null;
    try {
      exists = fs.existsSync(p);
      if (exists) {
        try {
          isSymlink = fs.lstatSync(p).isSymbolicLink();
          if (isSymlink) linkTarget = fs.readlinkSync(p);
        } catch {
          /* asar may throw on lstat */
        }
      }
    } catch (e) {
      linkTarget = String(e && e.message ? e.message : e);
    }
    return { p, exists, isSymlink, linkTarget };
  });
  let resolved = null;
  try {
    resolved = require.resolve('electron-log');
  } catch (e) {
    resolved = { error: String(e && e.message ? e.message : e) };
  }
  __gmDebugLog('A', 'electron-log resolve probe before require', {
    dirname: __dirname,
    probe,
    resolved,
  });
} catch (e) {
  __gmDebugLog('A', 'electron-log probe failed', { error: String(e && e.message ? e.message : e) });
}
// #endregion

const electron = require('electron');
let electronLog;
try {
  electronLog = require('electron-log');
  // #region agent log
  __gmDebugLog('A', 'electron-log require succeeded', {
    resolved: (() => {
      try {
        return require.resolve('electron-log');
      } catch {
        return null;
      }
    })(),
  });
  // #endregion
} catch (err) {
  // #region agent log
  __gmDebugLog('A', 'electron-log require FAILED', {
    error: String(err && err.message ? err.message : err),
    code: err && err.code,
  });
  // #endregion
  throw err;
}
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
