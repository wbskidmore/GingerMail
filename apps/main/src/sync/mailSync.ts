import { IPC_CHANNELS, type Folder, type FolderRole, type MessageHeader, type MessageThread } from '@gingermail/core';
import type { AppContext } from '../context.js';
import { enqueueDetection } from '../ai/detectionAgent.js';

/**
 * Folder roles we proactively sync on every refresh. Inbox/sent/drafts are
 * essential. Archive/trash/spam are included so messages remain visible
 * after being moved (otherwise an archived/trashed message disappears from
 * the local DB until the user opens that folder, which used to confuse
 * everyone in QA).
 *
 * "All Mail" / "Junk" / "Other" roles fall through to a single-folder fetch
 * on demand via `mail:listThreads` so we don't pull a million Gmail "All
 * Mail" entries every refresh.
 */
const SYNCED_ROLES: ReadonlyArray<FolderRole> = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam'];

const HEADERS_PER_FOLDER = 100;
const BODIES_PER_FOLDER = 25;

/**
 * Tracks an in-flight sync per account so two overlapping `refreshAll()`
 * calls don't race on the DB. The renderer's auto-refresh + the user's
 * manual refresh button used to both fire simultaneously after focus
 * return; the loser would overwrite cached bodies with empty stubs.
 */
const inFlight = new Map<string, Promise<void>>();

export async function syncAllMail(ctx: AppContext): Promise<void> {
  const accounts = ctx.db.listAccounts().filter((a) => a.enabled);
  await Promise.all(accounts.map((a) => syncAccount(ctx, a.id)));
}

async function syncAccount(ctx: AppContext, accountId: string): Promise<void> {
  const existing = inFlight.get(accountId);
  if (existing) return existing;
  const p = doSyncAccount(ctx, accountId).finally(() => {
    inFlight.delete(accountId);
  });
  inFlight.set(accountId, p);
  return p;
}

async function doSyncAccount(ctx: AppContext, accountId: string): Promise<void> {
  ctx.mainWindow?.webContents.send(IPC_CHANNELS.mailSyncEvent, { type: 'started', accountId });
  try {
    const provider = await ctx.getMailProvider(accountId);
    if (!provider) return;
    const folders = await provider.listFolders();
    ctx.db.upsertFolders(folders);

    // Pick the folders we actively sync each pass. We sync inbox first so
    // the user's primary view is up-to-date as quickly as possible, then
    // walk the rest in role order.
    const byRole = new Map<FolderRole, Folder>();
    for (const f of folders) {
      if (f.role && SYNCED_ROLES.includes(f.role)) {
        // Prefer the highest-level folder per role; many providers expose
        // both a virtual "Inbox" and a per-label sub-folder.
        const existing = byRole.get(f.role);
        if (!existing || (f.path?.length ?? 0) < (existing.path?.length ?? 0)) {
          byRole.set(f.role, f);
        }
      }
    }

    const ordered: Folder[] = [];
    for (const role of SYNCED_ROLES) {
      const f = byRole.get(role);
      if (f) ordered.push(f);
    }
    if (ordered.length === 0 && folders[0]) ordered.push(folders[0]);

    const errors: string[] = [];
    for (const folder of ordered) {
      try {
        await syncFolder(ctx, provider, folder);
      } catch (err) {
        // Per-folder failure shouldn't kill the whole account sync — log
        // it, emit a sync error event, and keep going on the next folder.
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${folder.role ?? folder.id}: ${msg}`);
        ctx.mainWindow?.webContents.send(IPC_CHANNELS.mailSyncEvent, {
          type: 'error',
          accountId,
          error: `Folder ${folder.name}: ${msg}`,
        });
      }
    }

    ctx.mainWindow?.webContents.send(IPC_CHANNELS.mailSyncEvent, { type: 'finished', accountId });
    if (errors.length > 0) {
      // Bubble up to the caller so callers can decide whether to keep the
      // user-visible spinner up or surface a toast.
      throw new Error(`sync had ${errors.length} folder error(s): ${errors[0]}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.mailSyncEvent, {
      type: 'error',
      accountId,
      error: msg,
    });
    throw err;
  }
}

async function syncFolder(
  ctx: AppContext,
  provider: {
    listMessageHeaders: (folderId: string, cursor?: string, limit?: number) => Promise<{ items: MessageHeader[]; nextCursor?: string }>;
    getMessage: (folderId: string, uid: string) => Promise<unknown>;
  },
  folder: Folder,
): Promise<void> {
  const page = await provider.listMessageHeaders(folder.id, undefined, HEADERS_PER_FOLDER);
  // Hydrate body for the latest BODIES_PER_FOLDER messages so opening them
  // is instant. Other folders besides inbox get hydrated lazily on click.
  const hydrateCount = folder.role === 'inbox' ? BODIES_PER_FOLDER : Math.min(5, page.items.length);
  const detailedIds = page.items.slice(0, hydrateCount).map((m) => m.uid);

  // Track which inbox messages are brand-new (not previously cached) so the
  // detection agent only scans freshly-arrived mail, never the whole inbox.
  const newlySeenIds =
    folder.role === 'inbox'
      ? new Set(page.items.filter((h) => !ctx.db.getMessage(h.id)).map((h) => h.id))
      : new Set<string>();

  const fullMessages: Array<MessageHeader & { body: { html?: string; text?: string }; attachments: unknown[] }> = [];
  for (const head of page.items) {
    if (detailedIds.includes(head.uid)) {
      try {
        const full = await provider.getMessage(folder.id, head.uid);
        fullMessages.push(full as MessageHeader & { body: { html?: string; text?: string }; attachments: unknown[] });
      } catch (err) {
        // CRITICAL: don't overwrite an already-cached body with an empty
        // stub. The previous version did `fullMessages.push({...head, body:{}})`
        // which made every transient fetch failure permanently wipe the
        // cached HTML body. Skip this message instead — the next refresh
        // will try again.
        const cached = ctx.db.getMessage(head.id);
        if (cached?.body && (cached.body.html || cached.body.text)) {
          fullMessages.push(cached as MessageHeader & { body: { html?: string; text?: string }; attachments: unknown[] });
        }
        const msg = err instanceof Error ? err.message : String(err);
        ctx.mainWindow?.webContents.send(IPC_CHANNELS.mailSyncEvent, {
          type: 'error',
          accountId: head.accountId,
          error: `Failed to fetch body for ${head.id}: ${msg}`,
        });
      }
    } else {
      // Only insert a stub if we have nothing cached. Otherwise keep the
      // existing body — header refreshes shouldn't blow it away.
      const cached = ctx.db.getMessage(head.id);
      if (cached?.body && (cached.body.html || cached.body.text)) {
        fullMessages.push({ ...head, body: cached.body, attachments: cached.attachments ?? [] });
      } else {
        fullMessages.push({ ...head, body: {}, attachments: [] });
      }
    }
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.mailSyncEvent, {
      type: 'progress',
      accountId: head.accountId,
      folderId: folder.id,
      count: fullMessages.length,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.db.upsertMessages(fullMessages as any);
  const threads = buildThreads(page.items);
  ctx.db.upsertThreads(threads);

  // Feed newly-arrived inbox mail to the detection agent (no-op when the
  // "scan mail" toggle is off). Uses cached body text when available.
  if (newlySeenIds.size) {
    for (const head of fullMessages) {
      if (!newlySeenIds.has(head.id)) continue;
      const text = head.body?.text || head.snippet || '';
      enqueueDetection(ctx, {
        source: 'mail',
        sourceId: head.id,
        accountId: head.accountId,
        sourceLabel: head.from?.email,
        text,
        context: `Email subject: ${head.subject}`,
      });
    }
  }
}

function buildThreads(headers: MessageHeader[]): MessageThread[] {
  const byThread = new Map<string, MessageHeader[]>();
  for (const h of headers) {
    const arr = byThread.get(h.threadId) ?? [];
    arr.push(h);
    byThread.set(h.threadId, arr);
  }
  const out: MessageThread[] = [];
  for (const [id, list] of byThread) {
    list.sort((a, b) => b.date - a.date);
    const first = list[0];
    if (!first) continue;
    out.push({
      id,
      accountId: first.accountId,
      subject: first.subject,
      participants: list.map((m) => m.from),
      messageIds: list.map((m) => m.id),
      lastMessageAt: first.date,
      unread: list.some((m) => m.unread),
      flagged: list.some((m) => m.flagged),
    });
  }
  return out;
}
