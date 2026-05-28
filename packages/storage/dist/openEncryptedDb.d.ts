import type DatabaseTypes from 'better-sqlite3';
export interface OpenEncryptedOptions {
    path: string;
    readonly?: boolean;
    /**
     * 64-hex-char (256-bit) key. When omitted the DB is opened plaintext
     * (testing / dev only — production main process always supplies a key).
     */
    encryptionKeyHex?: string;
}
export interface OpenEncryptedResult {
    db: DatabaseTypes.Database;
    encrypted: boolean;
    migratedFromPlaintext: boolean;
    driverFell: 'multiple-ciphers' | 'plain';
}
export declare function openEncryptedDatabase(opts: OpenEncryptedOptions): OpenEncryptedResult;
/** Generate a fresh 256-bit DB key as 64 hex chars. */
export declare function generateEncryptionKeyHex(): string;
//# sourceMappingURL=openEncryptedDb.d.ts.map