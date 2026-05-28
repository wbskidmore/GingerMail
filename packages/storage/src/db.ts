import { createRequire } from 'node:module';
import type FsModule from 'node:fs';
import type DatabaseTypes from 'better-sqlite3';
import { openEncryptedDatabase } from './openEncryptedDb.js';

import type {
  Account,
  Address,
  Calendar,
  CalendarEvent,
  EnergyTag,
  EventStatus,
  Folder,
  FolderRole,
  Message,
  MessageHeader,
  MessageThread,
  MutedSender,
  ProviderKind,
  ScheduledJob,
  ScheduledJobKind,
  SenderAction,
  Task,
  TaskList,
  TaskStatus,
} from '@gingermail/core';
import { CURRENT_SCHEMA_VERSION, SCHEMA_SQL } from './schema.js';

export interface OpenDbOptions {
  path: string;
  readonly?: boolean;
  /**
   * Optional 64-hex-char (256-bit) encryption key. When provided, the DB is
   * opened with a SQLCipher-compatible driver and on-disk data is encrypted.
   * If the file at `path` is an existing plaintext DB it is migrated in
   * place on the first open (with a `*.pre-encryption.<ts>.bak` breadcrumb).
   *
   * Production main process always supplies a key sourced from the OS
   * keychain via TokenVault. Tests and dev tooling omit the key for speed
   * and inspectability.
   */
  encryptionKeyHex?: string;
}

export class GingerMailDb {
  readonly db: DatabaseTypes.Database;
  /**
   * True when this connection is using the SQLCipher-compatible driver with
   * a key set. Surfaced for diagnostics and for the renderer's Privacy card.
   */
  readonly encrypted: boolean;
  /**
   * True when, on this open, an existing plaintext file was migrated to an
   * encrypted file. Useful for one-time UI breadcrumbs ("Your local mail
   * cache is now encrypted").
   */
  readonly migratedFromPlaintext: boolean;

  constructor(opts: OpenDbOptions) {
    const opened = openEncryptedDatabase({
      path: opts.path,
      readonly: opts.readonly,
      encryptionKeyHex: opts.encryptionKeyHex,
    });
    this.db = opened.db;
    this.encrypted = opened.encrypted;
    this.migratedFromPlaintext = opened.migratedFromPlaintext;
    // `openEncryptedDatabase` already applies WAL / FK / synchronous when
    // it opens through the encrypted path; we re-apply them defensively for
    // the plaintext path (where the helper returns immediately after open).
    if (!this.encrypted) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
    }
    this.db.exec(SCHEMA_SQL);
    // Take a pre-migration backup so a botched ALTER TABLE doesn't leave the
    // user with an unloadable database. Only attempted if the DB lives on
    // disk (not the in-memory test DB) and we're not read-only.
    if (!opts.readonly && opts.path && opts.path !== ':memory:') {
      this.backupBeforeMigration(opts.path);
    }
    this.migrate();
  }

  private backupBeforeMigration(dbPath: string): void {
    try {
      const fs = createRequire(import.meta.url)('node:fs') as typeof FsModule;
      const row = this.db
        .prepare(`SELECT value FROM schema_meta WHERE key = 'version'`)
        .get() as { value: string } | undefined;
      const current = row ? parseInt(row.value, 10) : 0;
      if (current >= CURRENT_SCHEMA_VERSION) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${dbPath}.pre-v${CURRENT_SCHEMA_VERSION}.${stamp}.bak`;
      if (fs.existsSync(dbPath) && !fs.existsSync(backupPath)) {
        fs.copyFileSync(dbPath, backupPath);
      }
    } catch {
      // Backup failure must NOT block startup. We swallow silently; the
      // migration itself will still run and the user retains the original
      // file via WAL. (Don't pull in electron-log here — this package
      // intentionally has no Electron dependency.)
    }
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    // Wrap every numbered migration in a single transaction so partial
    // failures (e.g. machine loses power mid-ALTER) leave the DB on the
    // previous schema version rather than half-migrated. sqlite's DDL is
    // transactional in WAL mode, including ALTER TABLE.
    const runMigrationTx = this.db.transaction(() => {
      const row = this.db
        .prepare(`SELECT value FROM schema_meta WHERE key = 'version'`)
        .get() as { value: string } | undefined;
      let current = row ? parseInt(row.value, 10) : 0;

      // -- v0 -> v1: original schema. SCHEMA_SQL above is the canonical v1.
      if (current === 0) {
        current = 1;
      }

      // -- v1 -> v2: add unsubscribe metadata + sender_actions.
      // `ALTER TABLE ... ADD COLUMN` is idempotent only via a try/catch —
      // sqlite doesn't support `ADD COLUMN IF NOT EXISTS`. The CREATE TABLE
      // for sender_actions IS idempotent, so the SCHEMA_SQL above already
      // handles freshly-created databases. We only have to back-fill the
      // ADD COLUMNs on existing databases.
      if (current === 1) {
        const addCol = (sql: string): void => {
          try { this.db.exec(sql); } catch (e) {
            // "duplicate column name" means we've already added it (e.g. on
            // a partial migration retry); anything else is real and should
            // bubble — that aborts the transaction so we don't commit a
            // half-migrated schema.
            if (!String(e).includes('duplicate column')) throw e;
          }
        };
        addCol(`ALTER TABLE messages ADD COLUMN list_unsubscribe_http TEXT`);
        addCol(`ALTER TABLE messages ADD COLUMN list_unsubscribe_mailto TEXT`);
        addCol(`ALTER TABLE messages ADD COLUMN list_unsubscribe_post INTEGER NOT NULL DEFAULT 0`);
        current = 2;
      }

      // -- v2 -> v3: introduce pending_sends outbox. The CREATE TABLE in
      // SCHEMA_SQL covers fresh installs; here we just bump the version.
      if (current === 2) {
        current = 3;
      }

      // -- v3 -> v4: add messages.muted flag for locally-trashed mail
      // from muted senders. Existing rows default to 0 (not muted).
      if (current === 3) {
        const addCol = (sql: string): void => {
          try { this.db.exec(sql); } catch (e) {
            if (!String(e).includes('duplicate column')) throw e;
          }
        };
        addCol(`ALTER TABLE messages ADD COLUMN muted INTEGER NOT NULL DEFAULT 0`);
        // Partial index for cheap "muted only" lookups; safe to re-create.
        this.db.exec(`CREATE INDEX IF NOT EXISTS messages_muted_idx ON messages(muted) WHERE muted = 1`);
        current = 4;
      }

      this.db
        .prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`)
        .run(String(Math.max(current, CURRENT_SCHEMA_VERSION)));
    });
    runMigrationTx();
  }

  // ---- Outbox (pending sends) ----

  /**
   * Insert (or no-op) a queued send row. Returns the row's status; if the
   * `clientId` already exists we return its current row rather than
   * inserting a duplicate. This is what gives `mail.send()` idempotency
   * across crashes and double-clicks.
   */
  enqueuePendingSend(input: {
    id: string;
    clientId: string;
    accountId: string;
    draftJson: string;
    now: number;
  }): { id: string; status: 'queued' | 'sending' | 'sent' | 'failed'; created: boolean } {
    const existing = this.db
      .prepare(`SELECT id, status FROM pending_sends WHERE client_id = ?`)
      .get(input.clientId) as { id: string; status: 'queued' | 'sending' | 'sent' | 'failed' } | undefined;
    if (existing) return { id: existing.id, status: existing.status, created: false };
    this.db
      .prepare(
        `INSERT INTO pending_sends (id, client_id, account_id, draft_json, status, attempts, max_attempts, next_attempt_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', 0, 5, ?, ?, ?)`,
      )
      .run(input.id, input.clientId, input.accountId, input.draftJson, input.now, input.now, input.now);
    return { id: input.id, status: 'queued', created: true };
  }

  /** Mark a send as in-flight; bumps attempts and updates `updated_at`. */
  markSendAttemptStarted(id: string, now: number): void {
    this.db
      .prepare(`UPDATE pending_sends SET status='sending', attempts = attempts + 1, updated_at = ? WHERE id = ?`)
      .run(now, id);
  }

  markSendSucceeded(id: string, now: number): void {
    this.db
      .prepare(`UPDATE pending_sends SET status='sent', last_error=NULL, updated_at=? WHERE id = ?`)
      .run(now, id);
  }

  markSendFailed(id: string, error: string, now: number, retryDelayMs: number): void {
    this.db
      .prepare(
        `UPDATE pending_sends
            SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
                last_error = ?,
                next_attempt_at = ? + ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(error, now, retryDelayMs, now, id);
  }

  /** Returns sends that are due for another attempt right now. */
  listDuePendingSends(now: number, limit = 25): Array<{
    id: string;
    accountId: string;
    draftJson: string;
    attempts: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, account_id as accountId, draft_json as draftJson, attempts
           FROM pending_sends
          WHERE status IN ('queued') AND next_attempt_at <= ?
          ORDER BY next_attempt_at ASC
          LIMIT ?`,
      )
      .all(now, limit) as Array<{ id: string; accountId: string; draftJson: string; attempts: number }>;
    return rows;
  }

  /**
   * Reset rows that were marked 'sending' more than `staleMs` ago — they
   * almost certainly correspond to a crashed app process and need another
   * attempt (or to be surfaced as "unknown — verify in Sent folder").
   */
  recoverStaleSending(staleMs: number, now: number): number {
    const cutoff = now - staleMs;
    const r = this.db
      .prepare(`UPDATE pending_sends SET status='queued', next_attempt_at=? WHERE status='sending' AND updated_at < ?`)
      .run(now, cutoff);
    return r.changes;
  }

  // ---- Accounts ----

  upsertAccount(account: Account, configJson?: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO accounts
         (id, kind, display_name, email_address, color, created_at, sync_interval_sec, signature, enabled, config_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        account.id,
        account.kind,
        account.displayName,
        account.emailAddress,
        account.color ?? null,
        account.createdAt,
        account.syncIntervalSec,
        account.signature ?? null,
        account.enabled ? 1 : 0,
        configJson ?? null,
      );
  }

  listAccounts(): Account[] {
    const rows = this.db.prepare(`SELECT * FROM accounts ORDER BY created_at ASC`).all() as Array<{
      id: string;
      kind: string;
      display_name: string;
      email_address: string;
      color: string | null;
      created_at: number;
      sync_interval_sec: number;
      signature: string | null;
      enabled: number;
      config_json: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as ProviderKind,
      displayName: r.display_name,
      emailAddress: r.email_address,
      color: r.color ?? undefined,
      createdAt: r.created_at,
      syncIntervalSec: r.sync_interval_sec,
      signature: r.signature ?? undefined,
      enabled: r.enabled === 1,
    }));
  }

  getAccountConfig(accountId: string): string | undefined {
    const r = this.db.prepare(`SELECT config_json FROM accounts WHERE id = ?`).get(accountId) as
      | { config_json: string | null }
      | undefined;
    return r?.config_json ?? undefined;
  }

  deleteAccount(id: string): void {
    this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
  }

  // ---- Folders ----

  upsertFolders(folders: Folder[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO folders (id, account_id, name, path, role, unread_count, total_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = this.db.transaction((items: Folder[]) => {
      for (const f of items) {
        stmt.run(f.id, f.accountId, f.name, f.path, f.role, f.unreadCount, f.totalCount);
      }
    });
    tx(folders);
  }

  listFolders(accountId: string): Folder[] {
    const rows = this.db
      .prepare(`SELECT * FROM folders WHERE account_id = ? ORDER BY name`)
      .all(accountId) as Array<{
      id: string;
      account_id: string;
      name: string;
      path: string;
      role: string;
      unread_count: number;
      total_count: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      name: r.name,
      path: r.path,
      role: r.role as FolderRole,
      unreadCount: r.unread_count,
      totalCount: r.total_count,
    }));
  }

  // ---- Messages ----

  upsertMessages(messages: Message[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO messages
       (id, account_id, folder_id, thread_id, uid, from_json, to_json, cc_json, bcc_json,
        subject, snippet, date, unread, flagged, has_attachments, labels_json, energy_tag,
        snoozed_until, body_html, body_text, attachments_json, in_reply_to, references_json, raw_headers_json,
        list_unsubscribe_http, list_unsubscribe_mailto, list_unsubscribe_post, muted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const ftsInsert = this.db.prepare(
      `INSERT INTO messages_fts (rowid, subject, snippet, from_text, body_text)
       VALUES ((SELECT rowid FROM messages WHERE id = ?), ?, ?, ?, ?)`,
    );
    const ftsDelete = this.db.prepare(
      `DELETE FROM messages_fts WHERE rowid = (SELECT rowid FROM messages WHERE id = ?)`,
    );
    // Stash muted senders inside this transaction so the "auto-trash from
    // muted sender" rule can apply atomically with the insert.
    const mutedRow = this.db.prepare(
      `SELECT 1 AS hit FROM sender_actions WHERE email = ? AND action = 'muted' LIMIT 1`,
    );
    const tx = this.db.transaction((items: Message[]) => {
      for (const m of items) {
        const muted = mutedRow.get(m.from.email.toLowerCase()) as { hit?: number } | undefined;
        const isMuted = !!muted?.hit;
        stmt.run(
          m.id,
          m.accountId,
          m.folderId,
          m.threadId,
          m.uid,
          JSON.stringify(m.from),
          JSON.stringify(m.to),
          m.cc ? JSON.stringify(m.cc) : null,
          m.bcc ? JSON.stringify(m.bcc) : null,
          m.subject,
          m.snippet,
          m.date,
          // A muted sender's mail is silently marked read so it doesn't
          // bump unread counters even if the user's filter rule on the
          // server hasn't moved it yet.
          isMuted ? 0 : (m.unread ? 1 : 0),
          m.flagged ? 1 : 0,
          m.hasAttachments ? 1 : 0,
          JSON.stringify(m.labels ?? []),
          m.energyTag ?? null,
          m.snoozedUntil ?? null,
          m.body?.html ?? null,
          m.body?.text ?? null,
          m.attachments ? JSON.stringify(m.attachments) : null,
          m.inReplyTo ?? null,
          m.references ? JSON.stringify(m.references) : null,
          m.rawHeaders ? JSON.stringify(m.rawHeaders) : null,
          m.listUnsubscribeHttp ?? null,
          m.listUnsubscribeMailto ?? null,
          m.listUnsubscribePost ? 1 : 0,
          isMuted ? 1 : 0,
        );
        ftsDelete.run(m.id);
        // Muted mail is intentionally left out of the FTS index so it
        // doesn't surface in search either. Unmuting + a fresh sync
        // re-inserts the row with muted=0 and re-indexes.
        if (!isMuted) {
          ftsInsert.run(m.id, m.subject, m.snippet, m.from.email, m.body?.text ?? '');
        }
      }
    });
    tx(messages);
  }

  // ---- Sender actions (unsubscribe / mute / dismiss) ----

  upsertSenderAction(action: SenderAction): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sender_actions (email, action, decided_at, source)
         VALUES (?, ?, ?, ?)`,
      )
      .run(action.email.toLowerCase(), action.action, action.decidedAt, action.source);
  }

  removeSenderAction(email: string): void {
    const lower = email.toLowerCase();
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM sender_actions WHERE email = ?`).run(lower);
      // Un-hide any previously muted rows so the user sees their mail
      // reappear immediately (no need to wait for the next sync).
      const flipped = this.db
        .prepare(`UPDATE messages SET muted = 0 WHERE muted = 1 AND lower(json_extract(from_json, '$.email')) = ?`)
        .run(lower);
      // Re-insert the now-visible rows into FTS so they show up in search again.
      if (typeof flipped.changes === 'number' && flipped.changes > 0) {
        const rows = this.db
          .prepare(`SELECT id, subject, snippet, from_json, body_text FROM messages WHERE muted = 0 AND lower(json_extract(from_json, '$.email')) = ?`)
          .all(lower) as Array<{ id: string; subject: string; snippet: string; from_json: string; body_text: string | null }>;
        const ftsDelete = this.db.prepare(`DELETE FROM messages_fts WHERE rowid = (SELECT rowid FROM messages WHERE id = ?)`);
        const ftsInsert = this.db.prepare(
          `INSERT INTO messages_fts (rowid, subject, snippet, from_text, body_text)
           VALUES ((SELECT rowid FROM messages WHERE id = ?), ?, ?, ?, ?)`,
        );
        for (const r of rows) {
          const from = safeJson<Address>(r.from_json, { email: '' });
          ftsDelete.run(r.id);
          ftsInsert.run(r.id, r.subject, r.snippet, from.email, r.body_text ?? '');
        }
      }
    });
    tx();
  }

  getSenderAction(email: string): SenderAction | undefined {
    const r = this.db
      .prepare(`SELECT email, action, decided_at, source FROM sender_actions WHERE email = ?`)
      .get(email.toLowerCase()) as
      | { email: string; action: SenderAction['action']; decided_at: number; source: string }
      | undefined;
    if (!r) return undefined;
    return { email: r.email, action: r.action, decidedAt: r.decided_at, source: r.source };
  }

  listMutedSenders(): MutedSender[] {
    const rows = this.db
      .prepare(`SELECT email, decided_at FROM sender_actions WHERE action = 'muted' ORDER BY decided_at DESC`)
      .all() as Array<{ email: string; decided_at: number }>;
    return rows.map((r) => ({ email: r.email, mutedAt: r.decided_at }));
  }

  listSenderActions(actions: Array<SenderAction['action']>): SenderAction[] {
    if (actions.length === 0) return [];
    const placeholders = actions.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT email, action, decided_at, source FROM sender_actions WHERE action IN (${placeholders}) ORDER BY decided_at DESC`,
      )
      .all(...actions) as Array<{ email: string; action: SenderAction['action']; decided_at: number; source: string }>;
    return rows.map((r) => ({ email: r.email, action: r.action, decidedAt: r.decided_at, source: r.source }));
  }

  /**
   * Trashed-vs-seen counters per sender, computed over the most recent
   * window. Used by the unsubscribe heuristic. Excludes senders we've
   * already taken action on, since suggesting them again is useless noise.
   */
  countTrashedBySender(opts: { sinceMs: number; minTotal?: number }): Array<{ email: string; total: number; trashed: number; lastSeen: number; exampleMessageId: string; listUnsubscribeHttp?: string; listUnsubscribeMailto?: string; listUnsubscribePost: boolean }> {
    const rows = this.db
      .prepare(
        `WITH src AS (
           SELECT lower(json_extract(from_json, '$.email')) AS email,
                  folder_id,
                  date,
                  id,
                  list_unsubscribe_http,
                  list_unsubscribe_mailto,
                  list_unsubscribe_post
           FROM messages
           WHERE date >= ?
         ),
         trashed_cte AS (
           SELECT lower(role) AS role, account_id FROM folders WHERE role = 'trash'
         )
         SELECT src.email AS email,
                COUNT(*) AS total,
                SUM(CASE WHEN lower(src.folder_id) LIKE '%trash%' OR lower(src.folder_id) LIKE '%bin%' THEN 1 ELSE 0 END) AS trashed,
                MAX(src.date) AS lastSeen,
                MAX(src.id) AS exampleMessageId,
                MAX(src.list_unsubscribe_http) AS list_unsubscribe_http,
                MAX(src.list_unsubscribe_mailto) AS list_unsubscribe_mailto,
                MAX(src.list_unsubscribe_post) AS list_unsubscribe_post
         FROM src
         LEFT JOIN sender_actions sa ON sa.email = src.email
         WHERE sa.email IS NULL
         GROUP BY src.email
         HAVING total >= ?
         ORDER BY trashed * 1.0 / total DESC, total DESC
         LIMIT 50`,
      )
      .all(opts.sinceMs, opts.minTotal ?? 3) as Array<{
        email: string;
        total: number;
        trashed: number;
        lastSeen: number;
        exampleMessageId: string;
        list_unsubscribe_http: string | null;
        list_unsubscribe_mailto: string | null;
        list_unsubscribe_post: number;
      }>;
    return rows.map((r) => ({
      email: r.email,
      total: r.total,
      trashed: r.trashed,
      lastSeen: r.lastSeen,
      exampleMessageId: r.exampleMessageId,
      listUnsubscribeHttp: r.list_unsubscribe_http ?? undefined,
      listUnsubscribeMailto: r.list_unsubscribe_mailto ?? undefined,
      listUnsubscribePost: r.list_unsubscribe_post === 1,
    }));
  }

  /**
   * Remove a message + its FTS row. Called after a successful server-side
   * move so the renderer doesn't keep showing a row that's no longer in
   * the source folder (a fresh sync re-populates it under the new id).
   */
  deleteMessage(id: string): void {
    const tx = this.db.transaction((mid: string) => {
      this.db
        .prepare(`DELETE FROM messages_fts WHERE rowid = (SELECT rowid FROM messages WHERE id = ?)`)
        .run(mid);
      this.db.prepare(`DELETE FROM messages WHERE id = ?`).run(mid);
    });
    tx(id);
  }

  setMessageFlags(id: string, patch: Partial<Pick<MessageHeader, 'unread' | 'flagged' | 'snoozedUntil' | 'energyTag'>>): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.unread !== undefined) {
      sets.push('unread = ?');
      values.push(patch.unread ? 1 : 0);
    }
    if (patch.flagged !== undefined) {
      sets.push('flagged = ?');
      values.push(patch.flagged ? 1 : 0);
    }
    if (patch.snoozedUntil !== undefined) {
      sets.push('snoozed_until = ?');
      values.push(patch.snoozedUntil);
    }
    if (patch.energyTag !== undefined) {
      sets.push('energy_tag = ?');
      values.push(patch.energyTag);
    }
    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  getMessage(id: string): Message | undefined {
    const r = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as MessageRow | undefined;
    if (!r) return undefined;
    return rowToMessage(r);
  }

  listMessages(input: { folderId?: string; threadId?: string; accountId?: string; limit?: number; offset?: number; includeMuted?: boolean }): MessageHeader[] {
    const where: string[] = [];
    const values: unknown[] = [];
    if (input.folderId) {
      where.push('folder_id = ?');
      values.push(input.folderId);
    }
    if (input.threadId) {
      where.push('thread_id = ?');
      values.push(input.threadId);
    }
    if (input.accountId) {
      where.push('account_id = ?');
      values.push(input.accountId);
    }
    if (!input.includeMuted) {
      where.push('muted = 0');
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = input.limit ?? 200;
    const offset = input.offset ?? 0;
    const rows = this.db
      .prepare(`SELECT * FROM messages ${whereSql} ORDER BY date DESC LIMIT ? OFFSET ?`)
      .all(...values, limit, offset) as MessageRow[];
    return rows.map(rowToHeader);
  }

  searchMessages(query: string, limit = 100): MessageHeader[] {
    // FTS5 throws SqliteError on malformed MATCH expressions (unbalanced
    // quotes, stray colons, reserved punctuation, etc.). Try the user's query
    // verbatim first so power users can use column scoping like
    // `from_text:alice`, then fall back to a strictly-quoted version of the
    // raw input, then give up with an empty list rather than crashing the IPC.
    const attempts = [query, safeFtsQuery(query)];
    for (const q of attempts) {
      try {
        const rows = this.db
          .prepare(
            `SELECT m.* FROM messages_fts
             JOIN messages m ON m.rowid = messages_fts.rowid
             WHERE messages_fts MATCH ? AND m.muted = 0
             ORDER BY m.date DESC
             LIMIT ?`,
          )
          .all(q, limit) as MessageRow[];
        return rows.map(rowToHeader);
      } catch {
        // try next attempt
      }
    }
    return [];
  }

  /**
   * Run a structured search built from an AI-produced NL spec. `ftsQuery` is
   * passed straight to FTS5 MATCH (already quoted by the model + sanitised
   * here); date bounds and `unread` are normal indexed comparisons.
   */
  searchMessagesAdvanced(
    spec: { ftsQuery?: string; after?: number; before?: number; unread?: boolean },
    limit = 100,
  ): MessageHeader[] {
    const hasFts = !!spec.ftsQuery && spec.ftsQuery.trim().length > 0;
    const where: string[] = [];
    const args: unknown[] = [];

    if (hasFts) {
      where.push('messages_fts MATCH ?');
      args.push(spec.ftsQuery);
    }
    if (typeof spec.after === 'number') {
      where.push('m.date >= ?');
      args.push(spec.after);
    }
    if (typeof spec.before === 'number') {
      where.push('m.date <= ?');
      args.push(spec.before);
    }
    if (typeof spec.unread === 'boolean') {
      where.push('m.unread = ?');
      args.push(spec.unread ? 1 : 0);
    }
    // Refuse to run a wide-open SELECT (matches the prior contract: callers
    // must supply at least one real filter), THEN tack on the muted=0 guard
    // so muted senders never bleed into AI search results.
    if (where.length === 0) return [];
    where.push('m.muted = 0');

    args.push(limit);
    const from = hasFts
      ? 'messages_fts JOIN messages m ON m.rowid = messages_fts.rowid'
      : 'messages m';
    const sql = `SELECT m.* FROM ${from} WHERE ${where.join(' AND ')} ORDER BY m.date DESC LIMIT ?`;
    try {
      const rows = this.db.prepare(sql).all(...args) as MessageRow[];
      return rows.map(rowToHeader);
    } catch {
      // If the AI handed us a malformed FTS expression, fall back to the same
      // query minus the FTS clause so we at least honour date/unread filters.
      if (hasFts) {
        return this.searchMessagesAdvanced({ ...spec, ftsQuery: undefined }, limit);
      }
      return [];
    }
  }

  upsertThreads(threads: MessageThread[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO threads (id, account_id, subject, participants_json, last_message_at, unread, flagged, energy_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = this.db.transaction((items: MessageThread[]) => {
      for (const t of items) {
        stmt.run(
          t.id,
          t.accountId,
          t.subject,
          JSON.stringify(t.participants),
          t.lastMessageAt,
          t.unread ? 1 : 0,
          t.flagged ? 1 : 0,
          t.energyTag ?? null,
        );
      }
    });
    tx(threads);
  }

  listThreads(input: { accountId?: string; limit?: number; offset?: number; includeMuted?: boolean }): MessageThread[] {
    const where: string[] = ['EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = threads.id' + (input.includeMuted ? ')' : ' AND m.muted = 0)')];
    const values: unknown[] = [];
    if (input.accountId) {
      where.push('account_id = ?');
      values.push(input.accountId);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    const rows = this.db
      .prepare(`SELECT * FROM threads ${whereSql} ORDER BY last_message_at DESC LIMIT ? OFFSET ?`)
      .all(...values, limit, offset) as Array<{
      id: string;
      account_id: string;
      subject: string;
      participants_json: string;
      last_message_at: number;
      unread: number;
      flagged: number;
      energy_tag: string | null;
    }>;
    return rows.map((r) => {
      const mq = input.includeMuted
        ? `SELECT id FROM messages WHERE thread_id = ? ORDER BY date DESC`
        : `SELECT id FROM messages WHERE thread_id = ? AND muted = 0 ORDER BY date DESC`;
      const messageIds = (this.db
        .prepare(mq)
        .all(r.id) as Array<{ id: string }>).map((x) => x.id);
      return {
        id: r.id,
        accountId: r.account_id,
        subject: r.subject,
        participants: safeJson<Address[]>(r.participants_json, []),
        messageIds,
        lastMessageAt: r.last_message_at,
        unread: r.unread === 1,
        flagged: r.flagged === 1,
        energyTag: (r.energy_tag as EnergyTag | null) ?? undefined,
      };
    });
  }

  // ---- Calendars / events ----

  upsertCalendars(cals: Calendar[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO calendars (id, account_id, name, color, readonly, primary_flag) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const tx = this.db.transaction((items: Calendar[]) => {
      for (const c of items) stmt.run(c.id, c.accountId, c.name, c.color, c.readonly ? 1 : 0, c.primary ? 1 : 0);
    });
    tx(cals);
  }

  listCalendars(): Calendar[] {
    const rows = this.db.prepare(`SELECT * FROM calendars ORDER BY name`).all() as Array<{
      id: string;
      account_id: string;
      name: string;
      color: string;
      readonly: number;
      primary_flag: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      name: r.name,
      color: r.color,
      readonly: r.readonly === 1,
      primary: r.primary_flag === 1,
    }));
  }

  upsertEvents(events: CalendarEvent[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO calendar_events
       (id, calendar_id, account_id, title, description, location, start, end, all_day, status,
        organizer_json, attendees_json, recurrence_rule, reminders_json, linked_message_id, linked_task_id, snoozed_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = this.db.transaction((items: CalendarEvent[]) => {
      for (const e of items) {
        stmt.run(
          e.id,
          e.calendarId,
          e.accountId,
          e.title,
          e.description ?? null,
          e.location ?? null,
          e.start,
          e.end,
          e.allDay ? 1 : 0,
          e.status,
          e.organizer ? JSON.stringify(e.organizer) : null,
          e.attendees ? JSON.stringify(e.attendees) : null,
          e.recurrenceRule ?? null,
          e.reminders ? JSON.stringify(e.reminders) : null,
          e.linkedMessageId ?? null,
          e.linkedTaskId ?? null,
          e.snoozedUntil ?? null,
        );
      }
    });
    tx(events);
  }

  listEvents(input: { from: number; to: number; calendarIds?: string[] }): CalendarEvent[] {
    const where: string[] = ['start < ? AND end > ?'];
    const values: unknown[] = [input.to, input.from];
    if (input.calendarIds && input.calendarIds.length > 0) {
      where.push(`calendar_id IN (${input.calendarIds.map(() => '?').join(',')})`);
      values.push(...input.calendarIds);
    }
    const rows = this.db
      .prepare(`SELECT * FROM calendar_events WHERE ${where.join(' AND ')} ORDER BY start ASC`)
      .all(...values) as Array<{
      id: string;
      calendar_id: string;
      account_id: string;
      title: string;
      description: string | null;
      location: string | null;
      start: number;
      end: number;
      all_day: number;
      status: string;
      organizer_json: string | null;
      attendees_json: string | null;
      recurrence_rule: string | null;
      reminders_json: string | null;
      linked_message_id: string | null;
      linked_task_id: string | null;
      snoozed_until: number | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      calendarId: r.calendar_id,
      accountId: r.account_id,
      title: r.title,
      description: r.description ?? undefined,
      location: r.location ?? undefined,
      start: r.start,
      end: r.end,
      allDay: r.all_day === 1,
      status: r.status as EventStatus,
      organizer: r.organizer_json ? safeJson<Address>(r.organizer_json) : undefined,
      attendees: r.attendees_json ? safeJson<Address[]>(r.attendees_json, []) : undefined,
      recurrenceRule: r.recurrence_rule ?? undefined,
      reminders: r.reminders_json ? safeJson<number[]>(r.reminders_json, []) : undefined,
      linkedMessageId: r.linked_message_id ?? undefined,
      linkedTaskId: r.linked_task_id ?? undefined,
      snoozedUntil: r.snoozed_until ?? undefined,
    }));
  }

  deleteEvent(id: string): void {
    this.db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id);
  }

  // ---- Tasks ----

  upsertTaskLists(lists: TaskList[]): void {
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO task_lists (id, account_id, name, color) VALUES (?, ?, ?, ?)`);
    const tx = this.db.transaction((items: TaskList[]) => {
      for (const l of items) stmt.run(l.id, l.accountId, l.name, l.color ?? null);
    });
    tx(lists);
  }

  listTaskLists(): TaskList[] {
    const rows = this.db.prepare(`SELECT * FROM task_lists ORDER BY name`).all() as Array<{
      id: string;
      account_id: string;
      name: string;
      color: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      name: r.name,
      color: r.color ?? undefined,
    }));
  }

  upsertTasks(tasks: Task[]): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO tasks
       (id, list_id, account_id, title, notes, status, starred, due, completed_at, energy_tag, snoozed_until, linked_message_id, linked_event_id, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = this.db.transaction((items: Task[]) => {
      for (const t of items) {
        stmt.run(
          t.id,
          t.listId,
          t.accountId,
          t.title,
          t.notes ?? null,
          t.status,
          t.starred ? 1 : 0,
          t.due ?? null,
          t.completedAt ?? null,
          t.energyTag ?? null,
          t.snoozedUntil ?? null,
          t.linkedMessageId ?? null,
          t.linkedEventId ?? null,
          t.position,
        );
      }
    });
    tx(tasks);
  }

  listTasks(listId?: string): Task[] {
    const rows = (
      listId
        ? this.db.prepare(`SELECT * FROM tasks WHERE list_id = ? ORDER BY position ASC, due ASC NULLS LAST`).all(listId)
        : this.db.prepare(`SELECT * FROM tasks ORDER BY position ASC, due ASC NULLS LAST`).all()
    ) as Array<{
      id: string;
      list_id: string;
      account_id: string;
      title: string;
      notes: string | null;
      status: string;
      starred: number;
      due: number | null;
      completed_at: number | null;
      energy_tag: string | null;
      snoozed_until: number | null;
      linked_message_id: string | null;
      linked_event_id: string | null;
      position: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      listId: r.list_id,
      accountId: r.account_id,
      title: r.title,
      notes: r.notes ?? undefined,
      status: r.status as TaskStatus,
      starred: r.starred === 1,
      due: r.due ?? undefined,
      completedAt: r.completed_at ?? undefined,
      energyTag: (r.energy_tag as EnergyTag | null) ?? undefined,
      snoozedUntil: r.snoozed_until ?? undefined,
      linkedMessageId: r.linked_message_id ?? undefined,
      linkedEventId: r.linked_event_id ?? undefined,
      position: r.position,
    }));
  }

  deleteTask(id: string): void {
    this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  }

  // ---- Scheduled jobs ----

  insertJob(job: ScheduledJob): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO scheduled_jobs (id, kind, fire_at, payload_json, created_at, fired_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(job.id, job.kind, job.fireAt, JSON.stringify(job.payload), job.createdAt, job.firedAt ?? null);
  }

  listDueJobs(now: number): ScheduledJob[] {
    const rows = this.db
      .prepare(`SELECT * FROM scheduled_jobs WHERE fired_at IS NULL AND fire_at <= ? ORDER BY fire_at`)
      .all(now) as Array<{
      id: string;
      kind: string;
      fire_at: number;
      payload_json: string;
      created_at: number;
      fired_at: number | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as ScheduledJobKind,
      fireAt: r.fire_at,
      payload: safeJson<Record<string, unknown>>(r.payload_json, {}),
      createdAt: r.created_at,
      firedAt: r.fired_at ?? undefined,
    }));
  }

  listAllJobs(): ScheduledJob[] {
    const rows = this.db.prepare(`SELECT * FROM scheduled_jobs ORDER BY fire_at`).all() as Array<{
      id: string;
      kind: string;
      fire_at: number;
      payload_json: string;
      created_at: number;
      fired_at: number | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as ScheduledJobKind,
      fireAt: r.fire_at,
      payload: safeJson<Record<string, unknown>>(r.payload_json, {}),
      createdAt: r.created_at,
      firedAt: r.fired_at ?? undefined,
    }));
  }

  markJobFired(id: string, firedAt: number): void {
    this.db.prepare(`UPDATE scheduled_jobs SET fired_at = ? WHERE id = ?`).run(firedAt, id);
  }

  deleteJob(id: string): void {
    this.db.prepare(`DELETE FROM scheduled_jobs WHERE id = ?`).run(id);
  }
}

type MessageRow = {
  id: string;
  account_id: string;
  folder_id: string;
  thread_id: string;
  uid: string;
  from_json: string;
  to_json: string;
  cc_json: string | null;
  bcc_json: string | null;
  subject: string;
  snippet: string;
  date: number;
  unread: number;
  flagged: number;
  has_attachments: number;
  labels_json: string | null;
  energy_tag: string | null;
  snoozed_until: number | null;
  body_html: string | null;
  body_text: string | null;
  attachments_json: string | null;
  in_reply_to: string | null;
  references_json: string | null;
  raw_headers_json: string | null;
  list_unsubscribe_http: string | null;
  list_unsubscribe_mailto: string | null;
  list_unsubscribe_post: number | null;
  muted: number | null;
};

function rowToHeader(r: MessageRow): MessageHeader {
  return {
    id: r.id,
    accountId: r.account_id,
    folderId: r.folder_id,
    threadId: r.thread_id,
    uid: r.uid,
    from: safeJson<Address>(r.from_json, { email: '' }),
    to: safeJson<Address[]>(r.to_json, []),
    cc: r.cc_json ? safeJson<Address[]>(r.cc_json, []) : undefined,
    bcc: r.bcc_json ? safeJson<Address[]>(r.bcc_json, []) : undefined,
    subject: r.subject,
    snippet: r.snippet,
    date: r.date,
    unread: r.unread === 1,
    flagged: r.flagged === 1,
    hasAttachments: r.has_attachments === 1,
    labels: r.labels_json ? safeJson<string[]>(r.labels_json, []) : [],
    energyTag: (r.energy_tag as EnergyTag | null) ?? undefined,
    snoozedUntil: r.snoozed_until ?? undefined,
  };
}

function rowToMessage(r: MessageRow): Message {
  return {
    ...rowToHeader(r),
    body: {
      html: r.body_html ?? undefined,
      text: r.body_text ?? undefined,
    },
    attachments: r.attachments_json ? safeJson<Message['attachments']>(r.attachments_json, []) : [],
    inReplyTo: r.in_reply_to ?? undefined,
    references: r.references_json ? safeJson<string[]>(r.references_json, []) : undefined,
    rawHeaders: r.raw_headers_json ? safeJson<Record<string, string>>(r.raw_headers_json, {}) : undefined,
    listUnsubscribeHttp: r.list_unsubscribe_http ?? undefined,
    listUnsubscribeMailto: r.list_unsubscribe_mailto ?? undefined,
    listUnsubscribePost: r.list_unsubscribe_post === 1,
  };
}

function safeJson<T>(s: string, fallback?: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error('failed to parse JSON column');
  }
}

/**
 * Quote arbitrary user text into a strictly-literal FTS5 MATCH expression.
 * Each whitespace-separated token becomes a quoted phrase, and we AND them
 * together. Embedded double quotes are FTS5-escaped by doubling. This loses
 * the ability to use FTS column scoping (from_text:foo) — that's intentional
 * for the fallback path so a stray colon or paren can't crash MATCH.
 */
export function safeFtsQuery(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '""';
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}
