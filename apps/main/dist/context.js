import path from 'node:path';
import { app, log, safeStorage } from './electronShim.js';
import { GingerMailDb, generateEncryptionKeyHex, openPrefs, readSettings, writeSettings, } from '@gingermail/storage';
import { defaultAppSettings } from '@gingermail/core';
import { AppleCalendarProvider, AppleMailProvider, GmailMailProvider, GoogleCalendarProvider, GoogleTasksProvider, ImapSmtpProvider, MicrosoftCalendarProvider, MicrosoftMailProvider, MicrosoftTasksProvider, Pop3Provider, buildGoogleAuth, } from '@gingermail/providers';
import { Scheduler } from './scheduler.js';
import { TokenVault } from './tokenVault.js';
import { GoogleOAuthFlow } from './oauth/google.js';
import { MicrosoftOAuthFlow } from './oauth/microsoft.js';
import { getBuildConfig } from './config.js';
export class AppContext {
    db;
    prefs;
    vault;
    scheduler;
    mainWindow = null;
    focusState = { active: false };
    updater = null;
    providerCache = new Map();
    async init() {
        const userData = app.getPath('userData');
        const dbPath = path.join(userData, 'gingermail.sqlite');
        this.prefs = openPrefs({ dir: userData });
        this.vault = new TokenVault({
            storage: safeStorage.isEncryptionAvailable() ? safeStorage : null,
            file: path.join(userData, 'gingermail.vault.json'),
        });
        // At-rest DB encryption (#1 of the production-readiness review).
        // The DB key is generated once on first launch and stored in the OS
        // keychain via TokenVault. If `safeStorage` isn't available we still
        // store the key (in the JSON fallback), but warn loudly because the
        // posture is degraded (key sits next to encrypted file).
        const dbKey = this.resolveDbEncryptionKey();
        this.db = new GingerMailDb({ path: dbPath, encryptionKeyHex: dbKey });
        if (this.db.migratedFromPlaintext) {
            log.warn('[context] migrated plaintext sqlite cache to encrypted on first launch');
        }
        if (!this.db.encrypted) {
            log.warn('[context] DB is OPEN PLAINTEXT - encryption driver unavailable or explicitly disabled via GM_ALLOW_UNENCRYPTED_DB');
        }
        // One-shot migration: pull any pre-existing cloud AI key out of
        // `prefs.json` (which was plaintext on disk) and into the OS-encrypted
        // TokenVault, then erase the prefs copy. We run this every boot so old
        // installs are eventually upgraded without user action.
        try {
            const settings = readSettings(this.prefs);
            const oldKey = settings?.ai?.cloud?.apiKey;
            if (settings && oldKey && oldKey.trim().length >= 8 && settings.ai.cloud) {
                const existing = this.vault.readAppSecret('aiCloudApiKey');
                if (!existing)
                    this.vault.writeAppSecret('aiCloudApiKey', oldKey.trim());
                // Rebuild a *Partial<AppSettings>*-shaped patch with the cloud
                // block fully populated (Partial<...> isn't deep-partial, so we
                // need every required field of `cloud`).
                writeSettings(this.prefs, {
                    ai: {
                        ...settings.ai,
                        cloud: { ...settings.ai.cloud, apiKey: '' },
                    },
                });
                log.info('[context] migrated cloud AI key out of prefs.json into vault');
            }
        }
        catch (err) {
            log.warn('[context] cloud AI key migration skipped:', err);
        }
        this.scheduler = new Scheduler({
            db: this.db,
            onFire: (job) => {
                this.mainWindow?.webContents.send('notifications:action', { jobId: job.id, action: 'fired' });
            },
            log,
        });
        this.scheduler.start();
        // Recover any sends that were 'sending' when the app died last time.
        // 5 minutes is far longer than a normal SMTP submission; anything older
        // is almost certainly a crash artifact and needs another attempt.
        try {
            const recovered = this.db.recoverStaleSending(5 * 60_000, Date.now());
            if (recovered > 0) {
                log.warn(`[context] recovered ${recovered} stale 'sending' outbox rows`);
            }
        }
        catch (err) {
            log.warn('[context] outbox recovery failed:', err);
        }
        log.info(`[context] initialised db=${dbPath}`);
    }
    setMainWindow(win) {
        this.mainWindow = win;
    }
    /**
     * Fetch the at-rest DB encryption key from TokenVault, generating one on
     * first launch. Returns `undefined` only when the user explicitly opted
     * out via `GM_ALLOW_UNENCRYPTED_DB=1` AND no key has ever been generated.
     * In every other configuration we always have a key.
     */
    resolveDbEncryptionKey() {
        if (process.env.GM_ALLOW_UNENCRYPTED_DB === '1' && !this.vault.readAppSecret('dbEncryptionKey')) {
            // Explicit opt-out, first run. Don't generate, leave DB plaintext.
            return undefined;
        }
        const existing = this.vault.readAppSecret('dbEncryptionKey');
        if (existing && /^[0-9a-fA-F]{64}$/.test(existing))
            return existing;
        const fresh = generateEncryptionKeyHex();
        this.vault.writeAppSecret('dbEncryptionKey', fresh);
        log.info('[context] generated new DB encryption key (stored in OS keychain via TokenVault)');
        return fresh;
    }
    async shutdown() {
        this.scheduler?.stop();
        for (const bundle of this.providerCache.values()) {
            await bundle.mail?.close().catch(() => undefined);
        }
        this.providerCache.clear();
        this.db?.close();
    }
    // ---- Settings ----
    getSettings() {
        return readSettings(this.prefs) ?? defaultAppSettings;
    }
    /**
     * Strip secrets from the settings object before crossing the IPC boundary.
     * The cloud AI api key is sourced exclusively from the TokenVault and
     * should never be visible in the renderer's settings store, mocked or not.
     */
    getSettingsForRenderer() {
        const s = this.getSettings();
        if (s.ai?.cloud) {
            return { ...s, ai: { ...s.ai, cloud: { ...s.ai.cloud, apiKey: '' } } };
        }
        return s;
    }
    updateSettings(patch) {
        // Renderer is never allowed to write the cloud AI key via this channel
        // - it has a dedicated `ai:setCloudKey` path that goes to the vault.
        let safePatch = patch;
        const aiPatch = patch.ai;
        if (aiPatch && aiPatch.cloud?.apiKey !== undefined) {
            const { apiKey: _ignored, ...restCloud } = aiPatch.cloud;
            void _ignored;
            safePatch = { ...patch, ai: { ...aiPatch, cloud: { ...restCloud } } };
        }
        return writeSettings(this.prefs, safePatch);
    }
    // ---- Providers ----
    async getMailProvider(accountId) {
        return (await this.getBundle(accountId))?.mail;
    }
    async getCalendarProvider(accountId) {
        return (await this.getBundle(accountId))?.calendar;
    }
    async getTaskProvider(accountId) {
        return (await this.getBundle(accountId))?.tasks;
    }
    async getAllMailProviders() {
        const accounts = this.db.listAccounts().filter((a) => a.enabled);
        const out = [];
        for (const a of accounts) {
            const b = await this.getBundle(a.id);
            if (b?.mail)
                out.push(b.mail);
        }
        return out;
    }
    async getAllCalendarProviders() {
        const accounts = this.db.listAccounts().filter((a) => a.enabled);
        const out = [];
        for (const a of accounts) {
            const b = await this.getBundle(a.id);
            if (b?.calendar)
                out.push(b.calendar);
        }
        return out;
    }
    async getAllTaskProviders() {
        const accounts = this.db.listAccounts().filter((a) => a.enabled);
        const out = [];
        for (const a of accounts) {
            const b = await this.getBundle(a.id);
            if (b?.tasks)
                out.push(b.tasks);
        }
        return out;
    }
    async forgetAccount(accountId) {
        const bundle = this.providerCache.get(accountId);
        if (bundle) {
            await bundle.mail?.close().catch(() => undefined);
            this.providerCache.delete(accountId);
        }
        this.vault.delete(accountId);
        this.db.deleteAccount(accountId);
    }
    beginGoogleOAuth() {
        const cfg = getBuildConfig();
        if (!cfg.googleClientId || !cfg.googleClientSecret) {
            return Promise.reject(new Error('Google OAuth client not configured. See apps/main/src/config.ts.'));
        }
        return new GoogleOAuthFlow(cfg.googleClientId, cfg.googleClientSecret).run();
    }
    beginMicrosoftOAuth() {
        const cfg = getBuildConfig();
        if (!cfg.microsoftClientId) {
            return Promise.reject(new Error('Microsoft OAuth client not configured. See apps/main/src/config.ts.'));
        }
        return new MicrosoftOAuthFlow(cfg.microsoftClientId).run();
    }
    async getBundle(accountId) {
        if (this.providerCache.has(accountId))
            return this.providerCache.get(accountId);
        const account = this.db.listAccounts().find((a) => a.id === accountId);
        if (!account)
            return undefined;
        const configJson = this.db.getAccountConfig(accountId);
        const secrets = this.vault.read(accountId);
        const bundle = await buildBundleFor(account, configJson, secrets);
        if (bundle)
            this.providerCache.set(accountId, bundle);
        return bundle;
    }
}
async function buildBundleFor(account, configJson, secrets) {
    const cfg = configJson ? JSON.parse(configJson) : {};
    switch (account.kind) {
        case 'imap-smtp': {
            const password = secrets?.['password'];
            if (!password)
                return undefined;
            const mail = new ImapSmtpProvider(account, {
                imapHost: String(cfg.imapHost),
                imapPort: Number(cfg.imapPort),
                imapSecure: Boolean(cfg.imapSecure),
                smtpHost: String(cfg.smtpHost),
                smtpPort: Number(cfg.smtpPort),
                smtpSecure: Boolean(cfg.smtpSecure),
                username: String(cfg.username ?? account.emailAddress),
                password,
                emailAddress: account.emailAddress,
            });
            return { mail };
        }
        case 'pop3': {
            const password = secrets?.['password'];
            if (!password)
                return undefined;
            const mail = new Pop3Provider(account, {
                pop3Host: String(cfg.pop3Host),
                pop3Port: Number(cfg.pop3Port),
                pop3Secure: Boolean(cfg.pop3Secure),
                smtpHost: String(cfg.smtpHost),
                smtpPort: Number(cfg.smtpPort),
                smtpSecure: Boolean(cfg.smtpSecure),
                username: String(cfg.username ?? account.emailAddress),
                password,
                emailAddress: account.emailAddress,
            });
            return { mail };
        }
        case 'apple-caldav': {
            const password = secrets?.['password'];
            if (!password)
                return undefined;
            const creds = {
                username: String(cfg.username ?? account.emailAddress),
                appSpecificPassword: password,
                emailAddress: account.emailAddress,
            };
            return {
                mail: new AppleMailProvider(account, creds),
                calendar: new AppleCalendarProvider(account, creds),
            };
        }
        case 'gmail': {
            const buildCfg = getBuildConfig();
            if (!buildCfg.googleClientId || !buildCfg.googleClientSecret)
                return undefined;
            const tokens = secrets ? { access_token: secrets['access_token'] ?? '', refresh_token: secrets['refresh_token'] ?? '' } : undefined;
            if (!tokens)
                return undefined;
            const auth = buildGoogleAuth(buildCfg.googleClientId, buildCfg.googleClientSecret, 'http://127.0.0.1:0/callback', tokens);
            return {
                mail: new GmailMailProvider(account, auth),
                calendar: new GoogleCalendarProvider(account, auth),
                tasks: new GoogleTasksProvider(account, auth),
            };
        }
        case 'microsoft': {
            const token = secrets?.['access_token'];
            if (!token)
                return undefined;
            return {
                mail: new MicrosoftMailProvider(account, token),
                calendar: new MicrosoftCalendarProvider(account, token),
                tasks: new MicrosoftTasksProvider(account, token),
            };
        }
        default:
            return undefined;
    }
}
//# sourceMappingURL=context.js.map