import fs from 'node:fs';

export interface TokenVaultOptions {
  storage: { encryptString: (s: string) => Buffer; decryptString: (b: Buffer) => string } | null;
  file: string;
}

/**
 * Account secrets vault. Uses Electron's `safeStorage` (which delegates to
 * macOS Keychain / Windows DPAPI / libsecret on Linux) when available, otherwise
 * falls back to a per-user JSON file (with a warning).
 */
export class TokenVault {
  private vault: Record<string, Record<string, string>>;
  constructor(private readonly opts: TokenVaultOptions) {
    this.vault = this.load();
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
    } catch {
      return {};
    }
  }

  private persist(): void {
    const json = JSON.stringify(this.vault);
    if (this.opts.storage) {
      fs.writeFileSync(this.opts.file, this.opts.storage.encryptString(json));
    } else {
      fs.writeFileSync(this.opts.file, json, 'utf8');
    }
  }
}
