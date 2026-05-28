export interface TokenVaultOptions {
    storage: {
        encryptString: (s: string) => Buffer;
        decryptString: (b: Buffer) => string;
    } | null;
    file: string;
}
/**
 * Account secrets vault. Uses Electron's `safeStorage` (which delegates to
 * macOS Keychain / Windows DPAPI / libsecret on Linux) when available, otherwise
 * falls back to a per-user JSON file (with a warning).
 */
export declare class TokenVault {
    private readonly opts;
    private vault;
    constructor(opts: TokenVaultOptions);
    read(accountId: string): Record<string, string> | undefined;
    write(accountId: string, secrets: Record<string, string>): void;
    delete(accountId: string): void;
    /**
     * Read a single application secret (not tied to a mail account). Used for
     * the cloud AI API key, future webhook tokens, etc. Stored under a
     * reserved account id so it can't collide with real accounts.
     */
    readAppSecret(key: string): string | undefined;
    /**
     * Write a single application secret. Pass `undefined` to delete.
     */
    writeAppSecret(key: string, value: string | undefined): void;
    private load;
    private persist;
}
//# sourceMappingURL=tokenVault.d.ts.map