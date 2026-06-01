import { app, BrowserWindow, dialog, ipcMain, Notification, systemPreferences } from '../electronShim.js';
import fs from 'node:fs/promises';
import { IPC_CHANNELS, createFocusState, type AddAccountInput, type AppSettings, type Account, type Address, type Draft, type Folder, type ListMessagesInput, type ListThreadsInput, type Message, type MoveResult, type Task, type CalendarEvent } from '@gingermail/core';
import type { IpcMainInvokeEvent } from 'electron';
import type { AppContext } from '../context.js';
import { handleAi } from './aiHandlers.js';
import { handleAccountAdd } from './accountHandlers.js';
import { syncAllMail } from '../sync/mailSync.js';
import { syncAllCalendars } from '../sync/calendarSync.js';
import { syncAllTasks } from '../sync/taskSync.js';
import { syncAllChat } from '../sync/chatSync.js';
import { applySuggestion } from '../ai/suggestionActions.js';
import { parseIcsString } from '@gingermail/providers';
import { randomUUID } from 'node:crypto';
import { sanitiseMailHtmlMain } from '../security/mailHtml.js';
import { safeHandle } from './guards.js';
import {
  AccountIdSchema,
  AddAccountInputSchema,
  CalDeleteSchema,
  MailArchiveSchema,
  MailForwardSchema,
  MailMarkReadSchema,
  MailMarkSpamSchema,
  MailMoveSchema,
  MailPrintSchema,
  MailReplySchema,
  MailSaveDraftSchema,
  MailSearchSchema,
  MailSendSchema,
  MailSetFlagSchema,
  MailSnoozeSchema,
  MailTrashSchema,
  OAuthKindSchema,
  SchedulerCancelSchema,
  SettingsUpdateSchema,
  SlackConnectTokenSchema,
  SlackDisconnectSchema,
  SlackListMessagesSchema,
  SlackMarkReadSchema,
  SlackSendSchema,
  DiscordConnectTokenSchema,
  SuggestionsAcceptSchema,
  SuggestionsRejectSchema,
  SuggestionsDismissSchema,
  TasksDeleteSchema,
  UnsubDismissSchema,
  UnsubMuteSchema,
  UnsubPerformSchema,
  UnsubUnmuteSchema,
} from './schemas.js';
import { isMainWindowSender } from './guards.js';

/**
 * Wrapper around `ipcMain.handle` that:
 *   - Removes any prior listener (idempotent re-registration for dev HMR).
 *   - Applies the sender guard so non-main-window senders are rejected
 *     before the handler runs. Channels that need additional input
 *     validation use `safeHandle` from ./guards.ts instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;
function handle(channel: string, listener: IpcHandler): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isMainWindowSender(event)) {
      return { ok: false, error: { code: 'SENDER_DENIED', message: 'Unauthorized IPC sender' } };
    }
    return (listener as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args);
  });
}

export function registerIpc(ctx: AppContext): void {
  // ----- App -----
  handle(IPC_CHANNELS.appGetVersion, () => app.getVersion());
  handle(IPC_CHANNELS.appGetPlatform, () => process.platform);
  handle(IPC_CHANNELS.appGetAccentColor, () => {
    try {
      const sys = systemPreferences.getAccentColor?.();
      if (!sys) return '#6366f1';
      return `#${sys.slice(0, 6)}`;
    } catch {
      return '#6366f1';
    }
  });

  // ----- Settings -----
  handle(IPC_CHANNELS.settingsGet, () => ctx.getSettingsForRenderer());
  safeHandle(IPC_CHANNELS.settingsUpdate, SettingsUpdateSchema, (patch) => {
    ctx.updateSettings(patch as Partial<AppSettings>);
    return ctx.getSettingsForRenderer();
  });

  // ----- Accounts -----
  handle(IPC_CHANNELS.accountsList, () => ctx.db.listAccounts());
  safeHandle(IPC_CHANNELS.accountsAdd, AddAccountInputSchema, (input) =>
    handleAccountAdd(ctx, input as AddAccountInput),
  );
  safeHandle(IPC_CHANNELS.accountsRemove, AccountIdSchema, async (id) => {
    await ctx.forgetAccount(id);
  });
  safeHandle(IPC_CHANNELS.accountsTest, AddAccountInputSchema, async (input) => {
    try {
      await handleAccountAdd(ctx, input as AddAccountInput, { testOnly: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  safeHandle(IPC_CHANNELS.accountsBeginOAuth, OAuthKindSchema, async (kind) => {
    if (kind === 'gmail') {
      const out = await ctx.beginGoogleOAuth();
      persistOAuth(ctx, out.account, out.tokens as Record<string, unknown>);
      return out.account;
    }
    const out = await ctx.beginMicrosoftOAuth();
    persistOAuth(ctx, out.account, out.tokens as Record<string, unknown>);
    return out.account;
  });

  // ----- Mail -----
  handle(IPC_CHANNELS.mailListFolders, async (_e, accountId: string) => {
    return ctx.db.listFolders(accountId);
  });

  handle(IPC_CHANNELS.mailListThreads, async (_e, input: ListThreadsInput) => {
    return ctx.db.listThreads({ accountId: input.accountId, limit: input.limit, offset: input.offset });
  });

  handle(IPC_CHANNELS.mailListMessages, async (_e, input: ListMessagesInput) => {
    return ctx.db.listMessages(input);
  });

  handle(IPC_CHANNELS.mailGetMessage, async (_e, id: string) => {
    const cached = ctx.db.getMessage(id);
    if (cached) return cached;
    const [accountId, folderId, uid] = id.split(':');
    if (!accountId || !folderId || !uid) throw new Error('Invalid message id');
    const provider = await ctx.getMailProvider(accountId);
    if (!provider) throw new Error('Provider unavailable');
    const folderFull = `${accountId}:${folderId}`;
    const msg = await provider.getMessage(folderFull, uid);
    ctx.db.upsertMessages([msg]);
    return msg;
  });

  safeHandle(IPC_CHANNELS.mailSend, MailSendSchema, async (input) => {
    const draft = input as Draft;
    // OUTBOX FLOW
    // 1. Coerce the draft into something with a stable client_id. The
    //    Composer is updated to populate `draft.id` from a UUIDv4 on save;
    //    we treat that as the idempotency key. Pre-outbox drafts may not
    //    have one — we mint one and persist it so a retry from the user's
    //    "Outbox" panel later still de-dupes.
    const clientId = draft.id && draft.id.length > 0 ? draft.id : randomUUID();
    const id = `send_${randomUUID()}`;
    const now = Date.now();
    const enqueued = ctx.db.enqueuePendingSend({
      id,
      clientId,
      accountId: draft.accountId,
      draftJson: JSON.stringify({ ...draft, id: clientId }),
      now,
    });
    // If the row already exists, return its current status without
    // resubmitting. Double-click on "Send" no longer = double-sent email.
    if (!enqueued.created && enqueued.status === 'sent') {
      return;
    }
    if (!enqueued.created && enqueued.status === 'sending') {
      throw new Error('This message is still being sent. Check the Outbox in a moment.');
    }

    const provider = await ctx.getMailProvider(draft.accountId);
    if (!provider) {
      ctx.db.markSendFailed(enqueued.id, 'Provider unavailable', now, 60_000);
      throw new Error('Provider unavailable');
    }
    ctx.db.markSendAttemptStarted(enqueued.id, now);
    try {
      await provider.send({ ...draft, id: clientId });
      ctx.db.markSendSucceeded(enqueued.id, Date.now());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Exponential backoff: 1m, 2m, 4m, 8m, 16m — capped at max_attempts.
      const attempts = Math.max(1, enqueued.created ? 1 : 1);
      const retryDelayMs = Math.min(60_000 * Math.pow(2, attempts - 1), 16 * 60_000);
      ctx.db.markSendFailed(enqueued.id, msg, Date.now(), retryDelayMs);
      throw err;
    }
  });

  safeHandle(IPC_CHANNELS.mailSaveDraft, MailSaveDraftSchema, async (input) => {
    const draft = input as Draft;
    const provider = await ctx.getMailProvider(draft.accountId);
    if (!provider) throw new Error('Provider unavailable');
    return provider.saveDraft(draft);
  });

  safeHandle(IPC_CHANNELS.mailSetFlag, MailSetFlagSchema, async (input) => {
    const [accountId, folderShort, uid] = input.id.split(':');
    if (!accountId || !folderShort || !uid) throw new Error('Invalid message id');
    const folderId = `${accountId}:${folderShort}`;
    const provider = await ctx.getMailProvider(accountId);
    await provider?.setFlag({ folderId, uid, flag: input.flag }).catch(() => undefined);
    if (input.flag === 'read') ctx.db.setMessageFlags(input.id, { unread: false });
    if (input.flag === 'unread') ctx.db.setMessageFlags(input.id, { unread: true });
    if (input.flag === 'star') ctx.db.setMessageFlags(input.id, { flagged: true });
    if (input.flag === 'unstar') ctx.db.setMessageFlags(input.id, { flagged: false });
  });

  safeHandle(IPC_CHANNELS.mailSnooze, MailSnoozeSchema, async (input) => {
    ctx.db.setMessageFlags(input.id, { snoozedUntil: input.until });
    ctx.scheduler.schedule({
      kind: 'snooze-wake',
      fireAt: input.until,
      payload: { messageId: input.id, subject: 'A snoozed email is ready' },
    });
  });

  safeHandle(IPC_CHANNELS.mailSearch, MailSearchSchema, async (query) => {
    const local = ctx.db.searchMessages(query, 100);
    if (local.length > 0) return local;
    const providers = await ctx.getAllMailProviders();
    const all: Message[] = [];
    for (const p of providers) {
      const heads = await p.search(query).catch(() => []);
      for (const h of heads) {
        all.push({ ...h, body: {}, attachments: [] });
      }
    }
    ctx.db.upsertMessages(all);
    return all.map((m) => ({ ...m, body: undefined, attachments: undefined })) as unknown as Message[];
  });

  handle(IPC_CHANNELS.mailRefreshAll, async () => {
    await syncAllMail(ctx);
  });

  // ---- Mail actions (archive / trash / move / mark / spam / reply / forward / print) ----

  safeHandle(IPC_CHANNELS.mailMove, MailMoveSchema, async (input): Promise<MoveResult> => {
    return moveMessage(ctx, input.id, input.folderId);
  });

  safeHandle(IPC_CHANNELS.mailArchive, MailArchiveSchema, async (input): Promise<MoveResult> => {
    return moveToRoleFolder(ctx, input.id, 'archive');
  });

  safeHandle(IPC_CHANNELS.mailTrash, MailTrashSchema, async (input): Promise<MoveResult> => {
    return moveToRoleFolder(ctx, input.id, 'trash');
  });

  safeHandle(IPC_CHANNELS.mailMarkRead, MailMarkReadSchema, async (input) => {
    const [accountId, folderShort, uid] = input.id.split(':');
    if (!accountId || !folderShort || !uid) throw new Error('Invalid message id');
    const folderId = `${accountId}:${folderShort}`;
    const provider = await ctx.getMailProvider(accountId);
    await provider?.setFlag({ folderId, uid, flag: input.read ? 'read' : 'unread' }).catch(() => undefined);
    ctx.db.setMessageFlags(input.id, { unread: !input.read });
  });

  safeHandle(IPC_CHANNELS.mailMarkSpam, MailMarkSpamSchema, async (input): Promise<MoveResult> => {
    const [accountId, folderShort, uid] = input.id.split(':');
    if (!accountId || !folderShort || !uid) throw new Error('Invalid message id');
    const folderId = `${accountId}:${folderShort}`;
    const provider = await ctx.getMailProvider(accountId);
    if (!provider) throw new Error('Provider unavailable');
    const previousFolderId = folderId;
    if (provider.reportSpam) {
      await provider.reportSpam({ folderId, uid });
      ctx.db.deleteMessage?.(input.id);
      return { ok: true, newId: input.id, previousFolderId };
    }
    // Fall back to a folder move into the account's spam folder.
    return moveToRoleFolder(ctx, input.id, 'spam');
  });

  safeHandle(IPC_CHANNELS.mailReply, MailReplySchema, async (input): Promise<Draft> => {
    const message = ctx.db.getMessage(input.id);
    if (!message) throw new Error('Message not found');
    return buildReplyDraft(ctx, message, input.all);
  });

  safeHandle(IPC_CHANNELS.mailForward, MailForwardSchema, async (input): Promise<Draft> => {
    const message = ctx.db.getMessage(input.id);
    if (!message) throw new Error('Message not found');
    return buildForwardDraft(message);
  });

  safeHandle(IPC_CHANNELS.mailPrint, MailPrintSchema, async (input) => {
    const message = ctx.db.getMessage(input.id);
    if (!message) throw new Error('Message not found');
    await printMessage(message);
  });

  // ----- Calendar -----
  handle(IPC_CHANNELS.calListCalendars, () => ctx.db.listCalendars());
  handle(IPC_CHANNELS.calListEvents, async (_e, input: { from: number; to: number; calendarIds?: string[] }) => {
    await syncAllCalendars(ctx, input.from, input.to).catch(() => undefined);
    return ctx.db.listEvents(input);
  });
  handle(IPC_CHANNELS.calCreate, async (_e, event: Omit<CalendarEvent, 'id'>) => {
    const provider = await ctx.getCalendarProvider(event.accountId);
    if (provider) {
      const created = await provider.createEvent(event);
      ctx.db.upsertEvents([created]);
      scheduleEventReminders(ctx, created);
      return created;
    }
    const local: CalendarEvent = { ...event, id: `local:${randomUUID()}` };
    ctx.db.upsertEvents([local]);
    scheduleEventReminders(ctx, local);
    return local;
  });
  handle(IPC_CHANNELS.calUpdate, async (_e, event: CalendarEvent) => {
    const provider = await ctx.getCalendarProvider(event.accountId);
    if (provider && !event.id.startsWith('local:')) {
      const updated = await provider.updateEvent(event);
      ctx.db.upsertEvents([updated]);
      return updated;
    }
    ctx.db.upsertEvents([event]);
    return event;
  });
  safeHandle(IPC_CHANNELS.calDelete, CalDeleteSchema, async (id) => {
    if (!id.startsWith('local:')) {
      const accountId = id.split(':')[0];
      if (accountId) {
        const provider = await ctx.getCalendarProvider(accountId);
        await provider?.deleteEvent(id).catch(() => undefined);
      }
    }
    ctx.db.deleteEvent(id);
  });
  handle(IPC_CHANNELS.calImportIcs, async () => {
    // SECURITY: do NOT accept a renderer-supplied path. Always force the
    // user through the native open dialog so the renderer can't read
    // arbitrary files off the user's disk via this channel.
    const res = await dialog.showOpenDialog({
      filters: [{ name: 'iCalendar', extensions: ['ics'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return [];
    const icsPath = res.filePaths[0];
    // Cap import size at 5MB. Real .ics files are < 1MB; refusing oversized
    // input keeps malicious renderers from triggering OOM by handing us a
    // multi-gigabyte file.
    const stat = await fs.stat(icsPath);
    if (stat.size > 5 * 1024 * 1024) {
      throw new Error('ICS file too large (max 5MB)');
    }
    const text = await fs.readFile(icsPath, 'utf8');
    const events = parseIcsString(text).map((e) => ({
      ...e,
      id: `local:${randomUUID()}`,
      calendarId: 'local-ics',
      accountId: 'local',
    }));
    ctx.db.upsertEvents(events);
    return events;
  });

  // ----- Tasks -----
  handle(IPC_CHANNELS.tasksListLists, async () => {
    await syncAllTasks(ctx).catch(() => undefined);
    const remote = ctx.db.listTaskLists();
    if (remote.length === 0) {
      const fallback = { id: 'local:default', accountId: 'local', name: 'Local tasks' };
      ctx.db.upsertTaskLists([fallback]);
      return [fallback];
    }
    return remote;
  });
  handle(IPC_CHANNELS.tasksList, (_e, listId?: string) => ctx.db.listTasks(listId));
  handle(IPC_CHANNELS.tasksCreate, async (_e, task: Omit<Task, 'id' | 'position'>) => {
    if (task.listId.startsWith('local:')) {
      const created: Task = { ...task, id: `local:${randomUUID()}`, position: Date.now() };
      ctx.db.upsertTasks([created]);
      scheduleTaskDue(ctx, created);
      return created;
    }
    const provider = await ctx.getTaskProvider(task.accountId);
    if (!provider) throw new Error('Provider unavailable');
    const created = await provider.createTask(task);
    ctx.db.upsertTasks([created]);
    scheduleTaskDue(ctx, created);
    return created;
  });
  handle(IPC_CHANNELS.tasksUpdate, async (_e, task: Task) => {
    if (task.id.startsWith('local:')) {
      ctx.db.upsertTasks([task]);
      return task;
    }
    const provider = await ctx.getTaskProvider(task.accountId);
    if (provider) await provider.updateTask(task);
    ctx.db.upsertTasks([task]);
    return task;
  });
  safeHandle(IPC_CHANNELS.tasksDelete, TasksDeleteSchema, async (id) => {
    if (!id.startsWith('local:')) {
      const accountId = id.split(':')[0];
      if (accountId) {
        const provider = await ctx.getTaskProvider(accountId);
        await provider?.deleteTask(id).catch(() => undefined);
      }
    }
    ctx.db.deleteTask(id);
  });
  handle(IPC_CHANNELS.tasksComplete, async (_e, id: string) => {
    const all = ctx.db.listTasks();
    const found = all.find((t) => t.id === id);
    if (!found) throw new Error('Task not found');
    const updated: Task = { ...found, status: 'completed', completedAt: Date.now() };
    ctx.db.upsertTasks([updated]);
    if (!id.startsWith('local:')) {
      const provider = await ctx.getTaskProvider(found.accountId);
      await provider?.updateTask(updated).catch(() => undefined);
    }
    return updated;
  });
  handle(IPC_CHANNELS.tasksReopen, async (_e, id: string) => {
    const all = ctx.db.listTasks();
    const found = all.find((t) => t.id === id);
    if (!found) throw new Error('Task not found');
    const updated: Task = { ...found, status: 'open', completedAt: undefined };
    ctx.db.upsertTasks([updated]);
    if (!id.startsWith('local:')) {
      const provider = await ctx.getTaskProvider(found.accountId);
      await provider?.updateTask(updated).catch(() => undefined);
    }
    return updated;
  });

  // ----- AI -----
  handleAi(ctx);

  // ----- Focus -----
  handle(IPC_CHANNELS.focusStart, (_e, input: { durationMin: number }) => {
    const settings = ctx.getSettings();
    ctx.focusState = createFocusState(input.durationMin, settings.focus.breakReminderEveryMin);
    ctx.scheduler.setSuppressed(true);
    if (ctx.focusState.endsAt) {
      ctx.scheduler.schedule({
        kind: 'focus-break',
        fireAt: ctx.focusState.endsAt,
        payload: { reason: 'focus-end' },
      });
    }
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.focusChanged, ctx.focusState);
  });
  handle(IPC_CHANNELS.focusStop, () => {
    ctx.focusState = { active: false };
    ctx.scheduler.setSuppressed(false);
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.focusChanged, ctx.focusState);
  });
  handle(IPC_CHANNELS.focusStatus, () => ctx.focusState);

  // ----- Scheduler -----
  handle(IPC_CHANNELS.schedulerListJobs, () => ctx.scheduler.listAll());
  safeHandle(IPC_CHANNELS.schedulerCancel, SchedulerCancelSchema, (id) => ctx.scheduler.cancel(id));

  // ----- Notifications -----
  handle(IPC_CHANNELS.notificationsTest, () => {
    if (Notification.isSupported()) {
      new Notification({ title: 'GingerMail', body: 'Notifications are working.' }).show();
    }
  });

  // ----- Unsubscribe / mute -----
  handle(IPC_CHANNELS.unsubListSuggestions, async () => {
    const { detectUnsubscribeSuggestions } = await import('../unsubscribe/detect.js');
    const heur = detectUnsubscribeSuggestions(ctx.db);
    if (heur.length === 0) return heur;
    const settings = ctx.getSettings();
    if (settings.ai.mode === 'off') return heur;
    try {
      const { buildAiClient, classifySendersForUnsubscribe } = await import('@gingermail/ai');
      // Cloud AI keys live in TokenVault, not in prefs.json. Re-hydrate
      // the apiKey here before constructing the client; otherwise cloud
      // users would silently fall back to heuristic-only because
      // `buildAiClient` short-circuits on a missing key.
      const aiSettings = settings.ai.mode === 'cloud' && settings.ai.cloud
        ? { ...settings.ai, cloud: { ...settings.ai.cloud, apiKey: ctx.vault.readAppSecret('aiCloudApiKey') ?? '' } }
        : settings.ai;
      const client = buildAiClient(aiSettings);
      if (!client) return heur;
      const candidates = heur.map((s) => {
        const sample = ctx.db.searchMessages(`from_text:"${s.email}"`, 5).slice(0, 5);
        return {
          email: s.email,
          sampleSubjects: sample.map((h) => h.subject).filter(Boolean),
          trashed: s.trashedCount,
          total: s.totalSeen,
          hasListUnsubscribe: Boolean(s.methods.http || s.methods.mailto),
        };
      });
      const verdicts = await classifySendersForUnsubscribe(client, candidates);
      const byEmail = new Map(verdicts.map((v) => [v.email.toLowerCase(), v]));
      const filtered = heur
        .map((s) => {
          const v = byEmail.get(s.email.toLowerCase());
          if (!v) return s;
          if (v.verdict === 'keep') return null;
          return { ...s, aiVerdict: v.verdict, aiConfidence: v.confidence, aiReason: v.reason };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      return filtered;
    } catch {
      return heur;
    }
  });

  safeHandle(IPC_CHANNELS.unsubPerform, UnsubPerformSchema, async (input) => {
    const { performUnsubscribe } = await import('../unsubscribe/perform.js');
    const result = await performUnsubscribe({ http: input.http, mailto: input.mailto, oneClick: input.oneClick });
    if (result.ok && result.method === 'http') {
      ctx.db.upsertSenderAction({ email: input.email, action: 'unsubscribed', decidedAt: Date.now(), source: 'one-click' });
    }
    return result;
  });

  safeHandle(IPC_CHANNELS.unsubMute, UnsubMuteSchema, async (input) => {
    ctx.db.upsertSenderAction({ email: input.email, action: 'muted', decidedAt: Date.now(), source: 'user' });
  });

  safeHandle(IPC_CHANNELS.unsubUnmute, UnsubUnmuteSchema, async (input) => {
    ctx.db.removeSenderAction(input.email);
  });

  safeHandle(IPC_CHANNELS.unsubDismiss, UnsubDismissSchema, async (input) => {
    ctx.db.upsertSenderAction({ email: input.email, action: 'dismissed', decidedAt: Date.now(), source: 'user' });
  });

  handle(IPC_CHANNELS.unsubListMuted, async () => ctx.db.listMutedSenders());

  // ----- Updates -----
  handle(IPC_CHANNELS.updatesStatus, () => ({
    active: ctx.updater?.isActive() ?? false,
    optIn: Boolean(ctx.getSettings().updates?.optIn),
    channel: ctx.getSettings().updates?.channel ?? 'latest',
  }));
  handle(IPC_CHANNELS.updatesCheck, async () => {
    if (!ctx.updater) return { available: false, error: 'Updater unavailable' };
    return ctx.updater.checkNow();
  });
  handle(IPC_CHANNELS.updatesDownload, async () => {
    if (!ctx.updater) return { ok: false, error: 'Updater unavailable' };
    return ctx.updater.downloadAndInstallOnQuit();
  });

  // ----- Slack / chat -----
  safeHandle(IPC_CHANNELS.slackConnectToken, SlackConnectTokenSchema, async (input) => {
    const account = await ctx.connectSlackToken(input.token);
    // Kick off a first sync so the tab has data immediately. Non-blocking.
    void syncAllChat(ctx).catch(() => undefined);
    return account;
  });

  handle(IPC_CHANNELS.slackBeginOAuth, async () => {
    const out = await ctx.beginSlackOAuth();
    persistOAuth(ctx, out.account, out.tokens as Record<string, unknown>);
    void syncAllChat(ctx).catch(() => undefined);
    return out.account;
  });

  safeHandle(IPC_CHANNELS.slackDisconnect, SlackDisconnectSchema, async (input) => {
    await ctx.forgetAccount(input.accountId);
  });

  handle(IPC_CHANNELS.slackListWorkspaces, () =>
    ctx.db.listAccounts().filter((a) => a.kind === 'slack' || a.kind === 'discord'),
  );

  // ----- Discord -----
  safeHandle(IPC_CHANNELS.discordConnectToken, DiscordConnectTokenSchema, async (input) => {
    const account = await ctx.connectDiscordToken(input.token);
    // Kick off a first sync so the tab has data immediately. Non-blocking.
    void syncAllChat(ctx).catch(() => undefined);
    return account;
  });

  handle(IPC_CHANNELS.slackListConversations, (_e, input?: { accountId?: string }) =>
    ctx.db.listChatConversations(input?.accountId),
  );

  safeHandle(IPC_CHANNELS.slackListMessages, SlackListMessagesSchema, async (input) => {
    const { accountId, conversationId } = splitChatId(input.conversationId);
    // Pull fresh from the provider so opening a conversation is up to date,
    // falling back to the local cache when the network call fails.
    const provider = await ctx.getChatProvider(accountId);
    if (provider) {
      try {
        const msgs = await provider.listMessages(conversationId, input.limit ?? 50);
        if (msgs.length) ctx.db.upsertChatMessages(msgs);
      } catch {
        /* offline / rate-limited: serve cache below */
      }
    }
    return ctx.db.listChatMessages(accountId, conversationId, input.limit ?? 50);
  });

  safeHandle(IPC_CHANNELS.slackSend, SlackSendSchema, async (input) => {
    const { accountId, conversationId } = splitChatId(input.conversationId);
    const provider = await ctx.getChatProvider(accountId);
    if (!provider) throw new Error('Slack workspace unavailable');
    const sent = await provider.sendMessage(conversationId, input.text);
    ctx.db.upsertChatMessages([sent]);
    // Sending implicitly reads the conversation up to our own message.
    ctx.db.markChatConversationRead(accountId, conversationId, sent.ts);
    return sent;
  });

  safeHandle(IPC_CHANNELS.slackMarkRead, SlackMarkReadSchema, async (input) => {
    const { accountId, conversationId } = splitChatId(input.conversationId);
    const provider = await ctx.getChatProvider(accountId);
    const latest = ctx.db.listChatMessages(accountId, conversationId, 1);
    const ts = latest[latest.length - 1]?.ts;
    if (ts) {
      ctx.db.markChatConversationRead(accountId, conversationId, ts);
      await provider?.markRead(conversationId, ts).catch(() => undefined);
    }
  });

  handle(IPC_CHANNELS.slackRefresh, async () => {
    await syncAllChat(ctx);
  });

  // ----- Suggestions (AI detection agents) -----
  handle(IPC_CHANNELS.suggestionsList, (_e, input?: { status?: string }) =>
    ctx.db.listSuggestions(input?.status as Parameters<typeof ctx.db.listSuggestions>[0]),
  );

  safeHandle(IPC_CHANNELS.suggestionsAccept, SuggestionsAcceptSchema, async (input) => {
    const suggestion = ctx.db.getSuggestion(input.id);
    if (!suggestion) throw new Error('Suggestion not found');
    const result = applySuggestion(ctx, suggestion);
    if (!result.ok) throw new Error(result.error ?? 'Could not create the item');
    ctx.db.setSuggestionStatus(input.id, 'accepted', result.entityId);
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.suggestionsChanged);
    return { ok: true, draft: result.draft };
  });

  safeHandle(IPC_CHANNELS.suggestionsReject, SuggestionsRejectSchema, async (input) => {
    ctx.db.setSuggestionStatus(input.id, 'rejected');
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.suggestionsChanged);
  });

  safeHandle(IPC_CHANNELS.suggestionsDismiss, SuggestionsDismissSchema, async (input) => {
    ctx.db.setSuggestionStatus(input.id, 'dismissed');
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.suggestionsChanged);
  });
}

/**
 * Split a global chat conversation id (`slack:<team>:<native>`) into its
 * account id and native Slack conversation id. Native Slack ids never
 * contain a colon, so the final colon is the unambiguous boundary.
 */
function splitChatId(globalId: string): { accountId: string; conversationId: string } {
  const idx = globalId.lastIndexOf(':');
  if (idx <= 0) return { accountId: globalId, conversationId: globalId };
  return { accountId: globalId.slice(0, idx), conversationId: globalId.slice(idx + 1) };
}

function persistOAuth(ctx: AppContext, account: Account, tokens: Record<string, unknown>): void {
  const config: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};
  if (typeof tokens['access_token'] === 'string') secrets['access_token'] = tokens['access_token'];
  if (typeof tokens['refresh_token'] === 'string') secrets['refresh_token'] = tokens['refresh_token'];
  if (typeof tokens['home_account_id'] === 'string') secrets['home_account_id'] = tokens['home_account_id'];
  ctx.db.upsertAccount(account, JSON.stringify(config));
  ctx.vault.write(account.id, secrets);
}

function scheduleEventReminders(ctx: AppContext, event: CalendarEvent): void {
  const reminders = event.reminders ?? [10];
  for (const minutes of reminders) {
    const fireAt = event.start - minutes * 60_000;
    if (fireAt < Date.now()) continue;
    ctx.scheduler.schedule({
      kind: 'event-reminder',
      fireAt,
      payload: {
        title: event.title,
        when: new Date(event.start).toLocaleString(),
        eventId: event.id,
      },
    });
  }
}

function scheduleTaskDue(ctx: AppContext, task: Task): void {
  if (!task.due) return;
  const fireAt = task.due;
  if (fireAt < Date.now()) return;
  ctx.scheduler.schedule({
    kind: 'task-due',
    fireAt,
    payload: { title: task.title, taskId: task.id, notes: task.notes ?? '' },
  });
}

/**
 * Move a message and best-effort keep the local cache consistent. Returns
 * the `newId` (since provider id format is `account:folder:uid` so a move
 * changes the id) plus the previous folder id so the renderer can offer an
 * Undo button that restores the message.
 */
async function moveMessage(ctx: AppContext, id: string, targetFolderId: string): Promise<MoveResult> {
  const [accountId, folderShort, uid] = id.split(':');
  if (!accountId || !folderShort || !uid) throw new Error('Invalid message id');
  const fromFolderId = `${accountId}:${folderShort}`;
  const provider = await ctx.getMailProvider(accountId);
  if (!provider?.moveMessage) {
    throw new Error('This account provider does not support moving messages yet.');
  }
  const out = await provider.moveMessage({ fromFolderId, toFolderId: targetFolderId, uid });
  const targetShort = targetFolderId.startsWith(`${accountId}:`)
    ? targetFolderId.slice(accountId.length + 1)
    : targetFolderId;
  const newId = `${accountId}:${targetShort}:${out.uid}`;
  // Refresh local cache: delete the stale row, then re-fetch on next read.
  ctx.db.deleteMessage?.(id);
  return { ok: true, newId, previousFolderId: fromFolderId };
}

async function moveToRoleFolder(ctx: AppContext, id: string, role: 'archive' | 'trash' | 'spam'): Promise<MoveResult> {
  const accountId = id.split(':')[0];
  if (!accountId) throw new Error('Invalid message id');
  const folders: Folder[] = await ctx.db.listFolders(accountId);
  let target = folders.find((f) => f.role === role);
  if (!target) {
    // Pull a fresh folder list from the provider in case the local cache
    // hasn't seen the destination folder yet.
    const provider = await ctx.getMailProvider(accountId);
    if (provider) {
      const remote = await provider.listFolders().catch(() => [] as Folder[]);
      target = remote.find((f) => f.role === role);
    }
  }
  if (!target) {
    throw new Error(`No ${role} folder found for this account.`);
  }
  return moveMessage(ctx, id, target.id);
}

/** Build a reply (or reply-all) Draft from the cached Message. */
function buildReplyDraft(ctx: AppContext, m: Message, all: boolean): Draft {
  const account = ctx.db.listAccounts().find((a) => a.id === m.accountId);
  const subject = m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`;
  const toList: Address[] = [m.from];
  const ccList: Address[] = all
    ? dedupAddresses(
        [...(m.to ?? []), ...(m.cc ?? [])].filter((a) => a.email && a.email.toLowerCase() !== account?.emailAddress.toLowerCase()),
      )
    : [];
  const references = [...(m.references ?? []), m.inReplyTo].filter(Boolean) as string[];
  const quoted = quoteBody(m);
  return {
    accountId: m.accountId,
    to: toList,
    cc: ccList.length ? ccList : undefined,
    subject,
    bodyHtml: quoted.html,
    bodyText: quoted.text,
    inReplyTo: m.id,
    references,
  };
}

/** Build a forward Draft (no recipients yet — composer collects them). */
function buildForwardDraft(m: Message): Draft {
  const subject = m.subject.startsWith('Fwd:') ? m.subject : `Fwd: ${m.subject}`;
  const quoted = quoteBody(m, true);
  return {
    accountId: m.accountId,
    to: [],
    subject,
    bodyHtml: quoted.html,
    bodyText: quoted.text,
    // Forwarded attachments stay referenced server-side; the renderer can
    // surface them so the user can choose to drop them before sending.
    attachments: (m.attachments ?? []).map((a) => ({ filename: a.filename ?? 'attachment', path: '' })),
  };
}

function quoteBody(m: Message, forward = false): { html: string; text: string } {
  const sentAt = new Date(m.date).toLocaleString();
  const header = forward
    ? `From: ${formatAddress(m.from)}\nDate: ${sentAt}\nSubject: ${m.subject}\nTo: ${(m.to ?? []).map(formatAddress).join(', ')}\n\n`
    : `On ${sentAt}, ${formatAddress(m.from)} wrote:\n\n`;
  const text = `${header}${(m.body?.text ?? m.snippet ?? '').split('\n').map((l) => `> ${l}`).join('\n')}\n`;
  const html = `<br><br><blockquote style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex"><div>${escapeHtml(header).replace(/\n/g, '<br>')}</div>${m.body?.html ?? `<pre>${escapeHtml(m.body?.text ?? m.snippet ?? '')}</pre>`}</blockquote>`;
  return { text, html };
}

function formatAddress(a: Address): string {
  return a.name ? `"${a.name}" <${a.email}>` : a.email;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}

function dedupAddresses<T extends { email: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = it.email.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Render the message body into an offscreen BrowserWindow then trigger the
 * native print dialog. Renderer-side iframes use `sandbox=""` so they can't
 * call `window.print()` themselves, hence this main-process path.
 */
async function printMessage(m: Message): Promise<void> {
  // ALWAYS run the body through the canonical sanitiser before serialising.
  // The print path used to splat `m.body?.html` straight into the document,
  // which let any sender with HTML mail execute arbitrary script + load
  // remote trackers inside the offscreen print window.
  const bodyHtml = m.body?.html
    ? sanitiseMailHtmlMain(m.body.html, { allowRemoteImages: false })
    : `<pre>${escapeHtml(m.body?.text ?? m.snippet ?? '')}</pre>`;

  const csp = "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:;";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${escapeHtml(m.subject || '(no subject)')}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;color:#111;}
header{border-bottom:1px solid #ccc;padding-bottom:12px;margin-bottom:12px;font-size:13px;color:#444;}
header h1{font-size:18px;margin:0 0 8px 0;color:#000;}
header dl{margin:0;display:grid;grid-template-columns:80px 1fr;gap:2px 8px;}
header dt{color:#888;}</style></head>
<body>
<header>
  <h1>${escapeHtml(m.subject || '(no subject)')}</h1>
  <dl>
    <dt>From:</dt><dd>${escapeHtml(formatAddress(m.from))}</dd>
    <dt>To:</dt><dd>${escapeHtml((m.to ?? []).map(formatAddress).join(', '))}</dd>
    <dt>Date:</dt><dd>${escapeHtml(new Date(m.date).toLocaleString())}</dd>
  </dl>
</header>
<main>${bodyHtml}</main>
</body></html>`;

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      webSecurity: true,
    },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true }, (ok, err) => {
        if (ok) resolve();
        else reject(new Error(err || 'Print cancelled'));
      });
    });
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}
