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
import type * as ElectronModule from 'electron';
import type * as ElectronLogModule from 'electron-log';
import type * as ElectronUpdaterModule from 'electron-updater';
import type * as GoogleApisModule from 'googleapis';
import type * as MsalNodeModule from '@azure/msal-node';

type GlobalShim = {
  __gmElectron?: typeof ElectronModule;
  __gmElectronLog?: typeof ElectronLogModule;
  __gmGetElectronUpdater?: () => typeof ElectronUpdaterModule;
  __gmGetGoogleApis?: () => typeof GoogleApisModule;
  __gmGetMsalNode?: () => typeof MsalNodeModule;
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

export function getElectronUpdater(): typeof ElectronUpdaterModule {
  return required('__gmGetElectronUpdater', g.__gmGetElectronUpdater)();
}

export function getGoogleApis(): typeof GoogleApisModule {
  return required('__gmGetGoogleApis', g.__gmGetGoogleApis)();
}

export function getMsalNode(): typeof MsalNodeModule {
  return required('__gmGetMsalNode', g.__gmGetMsalNode)();
}

