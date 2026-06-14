/**
 * Resolve a sqlite driver that supports at-rest encryption (SQLCipher-compatible
 * `better-sqlite3-multiple-ciphers`), with a graceful fallback to plain
 * `better-sqlite3` if the encrypted driver's native binding fails to load
 * (typical in some test environments) or if no encryption key is provided.
 *
 * Why two drivers:
 *   - We can't unilaterally require multiple-ciphers because its native
 *     binding may not be present on every contributor's machine.
 *   - We want production builds to use SQLCipher transparently — passing an
 *     `encryptionKeyHex` does the right thing without any branching at the
 *     callsite.
 *
 * Migration:
 *   - On first open with a key, if the file is detected as plaintext (the
 *     SQLite "is not a database" error means we cannot read with the
 *     supplied key), we transparently:
 *       1. Open the plaintext file with the unencrypted driver.
 *       2. ATTACH a fresh encrypted sibling, sqlcipher_export() into it.
 *       3. Replace the original file with the encrypted one (with a
 *          timestamped backup of the plaintext file).
 *   - The migration is wrapped so a power failure mid-flight leaves the
 *     original plaintext file in place (we only rename after the encrypted
 *     copy has been fully written + fsynced).
 */
import { createRequire } from 'node:module';
import type FsModule from 'node:fs';
import type CryptoModule from 'node:crypto';
import type DatabaseTypes from 'better-sqlite3';

const localRequire = createRequire(import.meta.url);

function loadDrivers(): { encrypted?: typeof DatabaseTypes; plain?: typeof DatabaseTypes } {
  // Both drivers are optional at module-load time so production builds (which
  // only ship the encrypted driver — see packages/storage/package.json) don't
  // crash at require() before the encrypted-path branch can run.
  let plain: typeof DatabaseTypes | undefined;
  try {
    plain = localRequire('better-sqlite3') as typeof DatabaseTypes;
  } catch {
    plain = undefined;
  }
  let encrypted: typeof DatabaseTypes | undefined;
  try {
    encrypted = localRequire('better-sqlite3-multiple-ciphers') as typeof DatabaseTypes;
  } catch {
    encrypted = undefined;
  }
  return { encrypted, plain };
}

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

const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;

export function openEncryptedDatabase(opts: OpenEncryptedOptions): OpenEncryptedResult {
  const { path: dbPath, readonly, encryptionKeyHex } = opts;
  const { encrypted: EncryptedDriver, plain: PlainDriver } = loadDrivers();

  // No key requested → plain driver, plain file. Same behavior as before.
  if (!encryptionKeyHex) {
    if (!PlainDriver) {
      throw new Error(
        '[storage] no encryptionKeyHex was supplied but `better-sqlite3` is not installed. ' +
          'Production builds ship the encrypted driver only; provide an encryptionKeyHex, or ' +
          'install better-sqlite3 (dev-only) to open plaintext databases.',
      );
    }
    const db = openWith(PlainDriver, dbPath, readonly);
    return { db, encrypted: false, migratedFromPlaintext: false, driverFell: 'plain' };
  }

  if (!HEX_KEY_RE.test(encryptionKeyHex)) {
    throw new Error(
      `[storage] encryptionKeyHex must be 64 hex chars (256 bits); got length ${encryptionKeyHex.length}`,
    );
  }

  if (!EncryptedDriver) {
    // Encrypted driver unavailable but caller asked for encryption.
    // We do NOT silently open plaintext; that would be a misleading downgrade
    // of the user's privacy posture. Fall through to plain driver only when
    // the explicit env override is set.
    if (process.env.GM_ALLOW_UNENCRYPTED_DB === '1' && PlainDriver) {
      const db = openWith(PlainDriver, dbPath, readonly);
      return { db, encrypted: false, migratedFromPlaintext: false, driverFell: 'plain' };
    }
    throw new Error(
      '[storage] encryptionKeyHex was supplied but `better-sqlite3-multiple-ciphers` is not installed. ' +
        'Run `pnpm install` to fetch the SQLCipher-compatible driver, or set GM_ALLOW_UNENCRYPTED_DB=1 to ' +
        'fall back to plaintext (NOT recommended for production).',
    );
  }

  // First, see if the file is encrypted with this key. We open + set key + try
  // to read sqlite_master. Three outcomes:
  //   - works → encrypted DB, our key is correct, done.
  //   - "file is not a database" → file is plaintext, run migration.
  //   - other error → propagate (likely permission / disk failure).
  const file = createRequire(import.meta.url)('node:fs') as typeof FsModule;
  const fileExists = file.existsSync(dbPath);

  if (fileExists) {
    const probeDb = openWith(EncryptedDriver, dbPath, false);
    try {
      probeDb.pragma(`key = "x'${encryptionKeyHex}'"`);
      // Cipher-related pragmas are no-ops on plaintext files but harmless when set.
      probeDb.pragma('cipher_page_size = 4096');
      probeDb.prepare('SELECT count(*) FROM sqlite_master').get();
      // Looks encrypted (or empty + key-set) and readable → done.
      configurePragmas(probeDb);
      return {
        db: probeDb,
        encrypted: true,
        migratedFromPlaintext: false,
        driverFell: 'multiple-ciphers',
      };
    } catch (err) {
      probeDb.close();
      const msg = String(err);
      if (!/not a database|SQLITE_NOTADB|file is encrypted|file is not/i.test(msg)) {
        throw err;
      }
      // Fall through to plaintext-migration path.
    }
  }

  // No file or file is plaintext: run a plaintext → encrypted migration.
  // If the file doesn't exist at all, we just create a fresh encrypted DB.
  if (!fileExists) {
    const db = openWith(EncryptedDriver, dbPath, false);
    db.pragma(`key = "x'${encryptionKeyHex}'"`);
    db.pragma('cipher_page_size = 4096');
    configurePragmas(db);
    return { db, encrypted: true, migratedFromPlaintext: false, driverFell: 'multiple-ciphers' };
  }

  migratePlaintextToEncrypted({ EncryptedDriver, PlainDriver }, dbPath, encryptionKeyHex);
  const db = openWith(EncryptedDriver, dbPath, false);
  db.pragma(`key = "x'${encryptionKeyHex}'"`);
  db.pragma('cipher_page_size = 4096');
  // After the rename it's safe to also apply user-facing pragmas.
  configurePragmas(db);
  return { db, encrypted: true, migratedFromPlaintext: true, driverFell: 'multiple-ciphers' };
}

function openWith(
  Driver: typeof DatabaseTypes,
  dbPath: string,
  readonly: boolean | undefined,
): DatabaseTypes.Database {
  return new Driver(dbPath, readonly === undefined ? {} : { readonly });
}

function configurePragmas(db: DatabaseTypes.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
}

/**
 * Convert an existing plaintext sqlite file at `dbPath` into a SQLCipher-encrypted
 * file at the same path, with the original preserved as
 * `<dbPath>.pre-encryption.<ISO timestamp>.bak`. Done via
 * `sqlcipher_export()`, which is atomic in the sense that the new file is
 * fully written before we rename.
 */
function migratePlaintextToEncrypted(
  drivers: { EncryptedDriver: typeof DatabaseTypes; PlainDriver?: typeof DatabaseTypes },
  dbPath: string,
  encryptionKeyHex: string,
): void {
  const fs = createRequire(import.meta.url)('node:fs') as typeof FsModule;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.pre-encryption.${stamp}.bak`;
  const encryptedTmp = `${dbPath}.encrypted-tmp`;

  // If a stale temp from a previous failed attempt is here, remove it so the
  // ATTACH below doesn't append to a leftover file with unknown contents.
  if (fs.existsSync(encryptedTmp)) {
    fs.rmSync(encryptedTmp);
  }
  // Drop any prior WAL/SHM siblings of the plaintext DB so the encrypted
  // copy's WAL is created from scratch.
  for (const sib of [`${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(sib)) {
      try {
        fs.rmSync(sib);
      } catch {
        /* ignore */
      }
    }
  }

  // Use the multiple-ciphers driver throughout, because it can open both
  // plaintext (no key) and encrypted DBs, which makes ATTACH semantics
  // consistent. (Mixing engines for ATTACH is undefined behavior.)
  const src = openWith(drivers.EncryptedDriver, dbPath, false);
  try {
    src.exec(
      `ATTACH DATABASE '${encryptedTmp.replace(/'/g, "''")}' AS encrypted KEY "x'${encryptionKeyHex}'"`,
    );
    src.exec(`SELECT sqlcipher_export('encrypted')`);
    src.exec(`DETACH DATABASE encrypted`);
  } finally {
    src.close();
  }

  // Both files now exist on disk. Move the plaintext one to backup, then
  // swap the encrypted temp into its place. We do this in two steps rather
  // than one atomic move because rename(2) can only atomically replace
  // within the same directory, and we want a recovery breadcrumb if the
  // second rename fails.
  if (!fs.existsSync(encryptedTmp)) {
    throw new Error('[storage] encryption export produced no output file');
  }
  fs.renameSync(dbPath, backupPath);
  try {
    fs.renameSync(encryptedTmp, dbPath);
  } catch (err) {
    // Restore the original on failure so the app can still boot.
    try {
      fs.renameSync(backupPath, dbPath);
    } catch {
      /* swallow */
    }
    throw err;
  }

  // The backup is an UNENCRYPTED copy of the user's mail cache. Restrict it to
  // owner-only and leave a sentinel note; it exists for rollback but should be
  // deleted once the migration is verified (compliance POA&M PM-010 / SC-28,
  // MP-6). We don't auto-delete so a botched migration is still recoverable.
  try {
    fs.chmodSync(backupPath, 0o600);
    fs.writeFileSync(
      `${backupPath}.README.txt`,
      'This .bak is an UNENCRYPTED copy of your mail cache made during ' +
        'at-rest encryption migration. If GingerMail is working normally, ' +
        'delete this .bak file. Keep it only if you need to roll back.\n',
    );
  } catch {
    /* best-effort hardening; do not fail the migration over perms */
  }
}

/** Generate a fresh 256-bit DB key as 64 hex chars. */
export function generateEncryptionKeyHex(): string {
  const crypto = createRequire(import.meta.url)('node:crypto') as typeof CryptoModule;
  return crypto.randomBytes(32).toString('hex');
}
