const g = globalThis;
function required(name, value) {
    if (value === undefined) {
        throw new Error(`[gingermail] electronShim: globalThis.${name} is undefined. ` +
            'The main process must be booted through apps/main/entry.cjs.');
    }
    return value;
}
export const electron = required('__gmElectron', g.__gmElectron);
export const { app, BrowserWindow, contextBridge, dialog, ipcMain, ipcRenderer, nativeImage, nativeTheme, Notification, safeStorage, shell, systemPreferences, } = electron;
export const log = required('__gmElectronLog', g.__gmElectronLog);
export function getElectronUpdater() {
    return required('__gmGetElectronUpdater', g.__gmGetElectronUpdater)();
}
export function getGoogleApis() {
    return required('__gmGetGoogleApis', g.__gmGetGoogleApis)();
}
export function getMsalNode() {
    return required('__gmGetMsalNode', g.__gmGetMsalNode)();
}
//# sourceMappingURL=electronShim.js.map