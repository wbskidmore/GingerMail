import fs from 'node:fs';

export interface TokenVaultLogger {
  warn: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
}

export interface TokenVaultOptions {
  storage: { encryptString: (s: string) => Buffer; decryptString: (b: Buffer) => string } | null;
  file: string;
  /**
   * Optional logger so the vault can warn loudly when it is forced into the
   * degraded plaintext-fallback posture (no OS keychain available).
   */
  log?: TokenVaultLogger;
  /**
   * When `storage` is null (OS keychain / safeStorage unavailable) the vault
   * would otherwise write all secrets — including the DB encryption key — as
   * plaintext JSON next to the encrypted database, defeating at-rest
   * protection (NIST SC-28 / IA-5). We REFUSE to do that silently. Set this
   * to true (driven by the `GM_ALLOW_PLAINTEXT_VAULT=1` dev escape hatch) to
   * explicitly accept the degraded posture.
   */
  allowPlaintextFallback?: boolean;
}

/**
 * Account secrets vault. Uses Electron's `safeStorage` (which delegates to
 * macOS Keychain / Windows DPAPI / libsecret on Linux) when available.
 *
 * When `safeStorage` is unavailable we do NOT silently fall back to plaintext:
 * persisting would leak the DB key and every credential. Instead we warn at
 * construction and throw on the first write unless the operator has explicitly
 * opted into the degraded posture (`allowPlaintextFallback`). This closes the
 * "silent plaintext vault" gap (compliance POA&M PM-005).
 */
export class TokenVault {
  private vault: Record<string, Record<string, string>>;
  private readonly usingPlaintext: boolean;

  constructor(private readonly opts: TokenVaultOptions) {
    this.usingPlaintext = opts.storage === null;
    if (this.usingPlaintext) {
      const where = opts.file;
      if (opts.allowPlaintextFallback) {
        opts.log?.warn(
          `[vault] SECURITY: OS keychain (safeStorage) is unavailable. Secrets, ` +
            `including the DB encryption key, are stored UNENCRYPTED at ${where} ` +
            `because GM_ALLOW_PLAINTEXT_VAULT is set. Do not use this on a real ` +
            `account/device.`,
        );
      } else {
        opts.log?.warn(
          `[vault] SECURITY: OS keychain (safeStorage) is unavailable. Refusing ` +
            `to store secrets as plaintext. Run on a platform with a working ` +
            `keychain, or set GM_ALLOW_PLAINTEXT_VAULT=1 to explicitly accept the ` +
            `degraded posture (dev only).`,
        );
      }
    }
    this.vault = this.load();
  }

  /** True when secrets are protected by the OS keychain (safeStorage). */
  get encrypted(): boolean {
    return !this.usingPlaintext;
  }

  read(accountId: string): Record<string, string> | undefined {
    return this.vault[accountId];
  }

  write(accountId: string, secrets: Record<string, string>): void {
    this.vault[accountId] = { ...this.vault[accountId], ...secrets };
    this.persist();
  }

  delete(accountId: string): void {
    delete this.vault[accountId];
    this.persist();
  }

  /**
   * Read a single application secret (not tied to a mail account). Used for
   * the cloud AI API key, future webhook tokens, etc. Stored under a
   * reserved account id so it can't collide with real accounts.
   */
  readAppSecret(key: string): string | undefined {
    return this.vault['__app__']?.[key];
  }

  /**
   * Write a single application secret. Pass `undefined` to delete.
   */
  writeAppSecret(key: string, value: string | undefined): void {
    const slot = this.vault['__app__'] ?? {};
    if (value === undefined || value === '') {
      delete slot[key];
    } else {
      slot[key] = value;
    }
    if (Object.keys(slot).length === 0) {
      delete this.vault['__app__'];
    } else {
      this.vault['__app__'] = slot;
    }
    this.persist();
  }

  private load(): Record<string, Record<string, string>> {
    if (!fs.existsSync(this.opts.file)) return {};
    try {
      const raw = fs.readFileSync(this.opts.file);
      if (this.opts.storage) {
        const decrypted = this.opts.storage.decryptString(raw);
        return JSON.parse(decrypted);
      }
      return JSON.parse(raw.toString('utf8'));
    } catch (err) {
      // A read/parse failure here previously returned an empty vault SILENTLY,
      // which can cause regeneration of the DB key (orphaning the encrypted
      // cache) or loss of credentials with no signal. Warn so the operator
      // can investigate before secrets are overwritten (AU-9 / SC-28).
      this.opts.log?.warn(
        `[vault] failed to read/parse ${this.opts.file}; treating as empty. ` +
          `Existing secrets may be unreadable. err=${err instanceof Error ? err.message : String(err)}`,
      );
      return {};
    }
  }

  private persist(): void {
    const json = JSON.stringify(this.vault);
    if (this.opts.storage) {
      fs.writeFileSync(this.opts.file, this.opts.storage.encryptString(json));
    } else {
      if (!this.opts.allowPlaintextFallback) {
        throw new Error(
          '[vault] refusing to persist secrets as plaintext (no OS keychain). ' +
            'Set GM_ALLOW_PLAINTEXT_VAULT=1 to override in development.',
        );
      }
      fs.writeFileSync(this.opts.file, json, 'utf8');
    }
    // Owner-only permissions on the secrets file (no-op on Windows ACLs but
    // harmless). Defense-in-depth for SC-28 / AC-6.
    this.hardenPermissions(this.opts.file);
  }

  private hardenPermissions(file: string): void {
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* best-effort; not all filesystems honor POSIX modes */
    }
  }
}
