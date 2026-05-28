/**
 * Bridge between the CJS `entry.cjs` boot shim and the rest of the ESM
 * main-process code.
 *
 * `entry.cjs` `require`s `electron`, `electron-log`, and the other CJS
 * dependencies eagerly (where Electron's main-process module interception
 * actually fires) and stashes the live module objects on `globalThis`. We
 * read them out here and re-export them with proper types so the rest of
 * the codebase can stay on ordinary ESM imports.
 *
 * See `entry.cjs` for the long explanation of why this two-step dance is
 * required on Electron 32.
 */
type GlobalShim = {
  __gmElectron?: typeof import('electron');
  __gmElectronLog?: typeof import('electron-log');
  __gmGetElectronUpdater?: () => typeof import('electron-updater');
  __gmGetGoogleApis?: () => typeof import('googleapis');
  __gmGetMsalNode?: () => typeof import('@azure/msal-node');
};

const g = globalThis as GlobalShim;

function required<T>(name: string, value: T | undefined): T {
  if (value === undefined) {
    throw new Error(
      `[gingermail] electronShim: globalThis.${name} is undefined. ` +
        'The main process must be booted through apps/main/entry.cjs.',
    );
  }
  return value;
}

export const electron = required('__gmElectron', g.__gmElectron);

export const {
  app,
  BrowserWindow,
  contextBridge,
  dialog,
  ipcMain,
  ipcRenderer,
  nativeImage,
  nativeTheme,
  Notification,
  safeStorage,
  shell,
  systemPreferences,
} = electron;

export const log = required('__gmElectronLog', g.__gmElectronLog);

export function getElectronUpdater(): typeof import('electron-updater') {
  return required('__gmGetElectronUpdater', g.__gmGetElectronUpdater)();
}

export function getGoogleApis(): typeof import('googleapis') {
  return required('__gmGetGoogleApis', g.__gmGetGoogleApis)();
}

export function getMsalNode(): typeof import('@azure/msal-node') {
  return required('__gmGetMsalNode', g.__gmGetMsalNode)();
}

