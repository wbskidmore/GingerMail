export declare const electron: typeof Electron.CrossProcessExports;
export declare const app: Electron.App, BrowserWindow: typeof Electron.CrossProcessExports.BrowserWindow, contextBridge: Electron.ContextBridge, dialog: Electron.Dialog, ipcMain: Electron.IpcMain, ipcRenderer: Electron.IpcRenderer, nativeImage: typeof Electron.NativeImage, nativeTheme: Electron.NativeTheme, Notification: typeof Electron.CrossProcessExports.Notification, safeStorage: Electron.SafeStorage, shell: Electron.Shell, systemPreferences: Electron.SystemPreferences;
export declare const log: import("electron-log").MainLogger & {
    default: import("electron-log").MainLogger;
};
export declare function getElectronUpdater(): typeof import('electron-updater');
export declare function getGoogleApis(): typeof import('googleapis');
export declare function getMsalNode(): typeof import('@azure/msal-node');
//# sourceMappingURL=electronShim.d.ts.map