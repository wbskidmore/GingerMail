/**
 * Build-time OAuth configuration.
 *
 * Populate these via environment variables at build / dev time:
 *   GM_GOOGLE_CLIENT_ID
 *   GM_GOOGLE_CLIENT_SECRET
 *   GM_MICROSOFT_CLIENT_ID
 *
 * When unset, OAuth providers are unavailable but the rest of the app
 * (IMAP/SMTP, POP3, Apple via app-specific password, AI) still works.
 */
export interface BuildConfig {
    googleClientId?: string;
    googleClientSecret?: string;
    microsoftClientId?: string;
    microsoftTenant?: string;
}
export declare function getBuildConfig(): BuildConfig;
//# sourceMappingURL=config.d.ts.map