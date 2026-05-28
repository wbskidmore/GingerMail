import type DatabaseTypes from 'better-sqlite3';
import type { Account, Calendar, CalendarEvent, Folder, Message, MessageHeader, MessageThread, MutedSender, ScheduledJob, SenderAction, Task, TaskList } from '@gingermail/core';
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
export declare class GingerMailDb {
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
    constructor(opts: OpenDbOptions);
    private backupBeforeMigration;
    close(): void;
    private migrate;
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
    }): {
        id: string;
        status: 'queued' | 'sending' | 'sent' | 'failed';
        created: boolean;
    };
    /** Mark a send as in-flight; bumps attempts and updates `updated_at`. */
    markSendAttemptStarted(id: string, now: number): void;
    markSendSucceeded(id: string, now: number): void;
    markSendFailed(id: string, error: string, now: number, retryDelayMs: number): void;
    /** Returns sends that are due for another attempt right now. */
    listDuePendingSends(now: number, limit?: number): Array<{
        id: string;
        accountId: string;
        draftJson: string;
        attempts: number;
    }>;
    /**
     * Reset rows that were marked 'sending' more than `staleMs` ago — they
     * almost certainly correspond to a crashed app process and need another
     * attempt (or to be surfaced as "unknown — verify in Sent folder").
     */
    recoverStaleSending(staleMs: number, now: number): number;
    upsertAccount(account: Account, configJson?: string): void;
    listAccounts(): Account[];
    getAccountConfig(accountId: string): string | undefined;
    deleteAccount(id: string): void;
    upsertFolders(folders: Folder[]): void;
    listFolders(accountId: string): Folder[];
    upsertMessages(messages: Message[]): void;
    upsertSenderAction(action: SenderAction): void;
    removeSenderAction(email: string): void;
    getSenderAction(email: string): SenderAction | undefined;
    listMutedSenders(): MutedSender[];
    listSenderActions(actions: Array<SenderAction['action']>): SenderAction[];
    /**
     * Trashed-vs-seen counters per sender, computed over the most recent
     * window. Used by the unsubscribe heuristic. Excludes senders we've
     * already taken action on, since suggesting them again is useless noise.
     */
    countTrashedBySender(opts: {
        sinceMs: number;
        minTotal?: number;
    }): Array<{
        email: string;
        total: number;
        trashed: number;
        lastSeen: number;
        exampleMessageId: string;
        listUnsubscribeHttp?: string;
        listUnsubscribeMailto?: string;
        listUnsubscribePost: boolean;
    }>;
    /**
     * Remove a message + its FTS row. Called after a successful server-side
     * move so the renderer doesn't keep showing a row that's no longer in
     * the source folder (a fresh sync re-populates it under the new id).
     */
    deleteMessage(id: string): void;
    setMessageFlags(id: string, patch: Partial<Pick<MessageHeader, 'unread' | 'flagged' | 'snoozedUntil' | 'energyTag'>>): void;
    getMessage(id: string): Message | undefined;
    listMessages(input: {
        folderId?: string;
        threadId?: string;
        accountId?: string;
        limit?: number;
        offset?: number;
        includeMuted?: boolean;
    }): MessageHeader[];
    searchMessages(query: string, limit?: number): MessageHeader[];
    /**
     * Run a structured search built from an AI-produced NL spec. `ftsQuery` is
     * passed straight to FTS5 MATCH (already quoted by the model + sanitised
     * here); date bounds and `unread` are normal indexed comparisons.
     */
    searchMessagesAdvanced(spec: {
        ftsQuery?: string;
        after?: number;
        before?: number;
        unread?: boolean;
    }, limit?: number): MessageHeader[];
    upsertThreads(threads: MessageThread[]): void;
    listThreads(input: {
        accountId?: string;
        limit?: number;
        offset?: number;
        includeMuted?: boolean;
    }): MessageThread[];
    upsertCalendars(cals: Calendar[]): void;
    listCalendars(): Calendar[];
    upsertEvents(events: CalendarEvent[]): void;
    listEvents(input: {
        from: number;
        to: number;
        calendarIds?: string[];
    }): CalendarEvent[];
    deleteEvent(id: string): void;
    upsertTaskLists(lists: TaskList[]): void;
    listTaskLists(): TaskList[];
    upsertTasks(tasks: Task[]): void;
    listTasks(listId?: string): Task[];
    deleteTask(id: string): void;
    insertJob(job: ScheduledJob): void;
    listDueJobs(now: number): ScheduledJob[];
    listAllJobs(): ScheduledJob[];
    markJobFired(id: string, firedAt: number): void;
    deleteJob(id: string): void;
}
/**
 * Quote arbitrary user text into a strictly-literal FTS5 MATCH expression.
 * Each whitespace-separated token becomes a quoted phrase, and we AND them
 * together. Embedded double quotes are FTS5-escaped by doubling. This loses
 * the ability to use FTS column scoping (from_text:foo) — that's intentional
 * for the fallback path so a stray colon or paren can't crash MATCH.
 */
export declare function safeFtsQuery(raw: string): string;
//# sourceMappingURL=db.d.ts.map