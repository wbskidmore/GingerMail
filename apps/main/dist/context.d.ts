import type { BrowserWindow } from 'electron';
import { GingerMailDb, type PrefsStore } from '@gingermail/storage';
import type { Account, AppSettings, FocusState } from '@gingermail/core';
import type { CalendarProvider, MailProvider, TaskProvider } from '@gingermail/providers';
import { Scheduler } from './scheduler.js';
import { TokenVault } from './tokenVault.js';
import type { UpdaterController } from './autoUpdater.js';
export declare class AppContext {
    db: GingerMailDb;
    prefs: PrefsStore;
    vault: TokenVault;
    scheduler: Scheduler;
    mainWindow: BrowserWindow | null;
    focusState: FocusState;
    updater: UpdaterController | null;
    private providerCache;
    init(): Promise<void>;
    setMainWindow(win: BrowserWindow): void;
    /**
     * Fetch the at-rest DB encryption key from TokenVault, generating one on
     * first launch. Returns `undefined` only when the user explicitly opted
     * out via `GM_ALLOW_UNENCRYPTED_DB=1` AND no key has ever been generated.
     * In every other configuration we always have a key.
     */
    private resolveDbEncryptionKey;
    shutdown(): Promise<void>;
    getSettings(): AppSettings;
    /**
     * Strip secrets from the settings object before crossing the IPC boundary.
     * The cloud AI api key is sourced exclusively from the TokenVault and
     * should never be visible in the renderer's settings store, mocked or not.
     */
    getSettingsForRenderer(): AppSettings;
    updateSettings(patch: Partial<AppSettings>): AppSettings;
    getMailProvider(accountId: string): Promise<MailProvider | undefined>;
    getCalendarProvider(accountId: string): Promise<CalendarProvider | undefined>;
    getTaskProvider(accountId: string): Promise<TaskProvider | undefined>;
    getAllMailProviders(): Promise<MailProvider[]>;
    getAllCalendarProviders(): Promise<CalendarProvider[]>;
    getAllTaskProviders(): Promise<TaskProvider[]>;
    forgetAccount(accountId: string): Promise<void>;
    beginGoogleOAuth(): Promise<{
        account: Account;
        tokens: unknown;
    }>;
    beginMicrosoftOAuth(): Promise<{
        account: Account;
        tokens: unknown;
    }>;
    private getBundle;
}
//# sourceMappingURL=context.d.ts.map