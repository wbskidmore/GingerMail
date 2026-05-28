import { app, BrowserWindow, dialog, ipcMain, Notification, systemPreferences } from '../electronShim.js';
import fs from 'node:fs/promises';
import { IPC_CHANNELS, createFocusState } from '@gingermail/core';
import { handleAi } from './aiHandlers.js';
import { handleAccountAdd } from './accountHandlers.js';
import { syncAllMail } from '../sync/mailSync.js';
import { syncAllCalendars } from '../sync/calendarSync.js';
import { syncAllTasks } from '../sync/taskSync.js';
import { parseIcsString } from '@gingermail/providers';
import { randomUUID } from 'node:crypto';
import { sanitiseMailHtmlMain } from '../security/mailHtml.js';
import { safeHandle } from './guards.js';
import { AccountIdSchema, AddAccountInputSchema, OAuthKindSchema, SettingsUpdateSchema, UnsubDismissSchema, UnsubMuteSchema, UnsubPerformSchema, UnsubUnmuteSchema, } from './schemas.js';
import { isMainWindowSender } from './guards.js';
function handle(channel, listener) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, ...args) => {
        if (!isMainWindowSender(event)) {
            return { ok: false, error: { code: 'SENDER_DENIED', message: 'Unauthorized IPC sender' } };
        }
        return listener(event, ...args);
    });
}
export function registerIpc(ctx) {
    // ----- App -----
    handle(IPC_CHANNELS.appGetVersion, () => app.getVersion());
    handle(IPC_CHANNELS.appGetPlatform, () => process.platform);
    handle(IPC_CHANNELS.appGetAccentColor, () => {
        try {
            const sys = systemPreferences.getAccentColor?.();
            if (!sys)
                return '#6366f1';
            return `#${sys.slice(0, 6)}`;
        }
        catch {
            return '#6366f1';
        }
    });
    // ----- Settings -----
    handle(IPC_CHANNELS.settingsGet, () => ctx.getSettingsForRenderer());
    safeHandle(IPC_CHANNELS.settingsUpdate, SettingsUpdateSchema, (patch) => {
        ctx.updateSettings(patch);
        return ctx.getSettingsForRenderer();
    });
    // ----- Accounts -----
    handle(IPC_CHANNELS.accountsList, () => ctx.db.listAccounts());
    safeHandle(IPC_CHANNELS.accountsAdd, AddAccountInputSchema, (input) => handleAccountAdd(ctx, input));
    safeHandle(IPC_CHANNELS.accountsRemove, AccountIdSchema, async (id) => {
        await ctx.forgetAccount(id);
    });
    safeHandle(IPC_CHANNELS.accountsTest, AddAccountInputSchema, async (input) => {
        try {
            await handleAccountAdd(ctx, input, { testOnly: true });
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    });
    safeHandle(IPC_CHANNELS.accountsBeginOAuth, OAuthKindSchema, async (kind) => {
        if (kind === 'gmail') {
            const out = await ctx.beginGoogleOAuth();
            persistOAuth(ctx, out.account, out.tokens);
            return out.account;
        }
        const out = await ctx.beginMicrosoftOAuth();
        persistOAuth(ctx, out.account, out.tokens);
        return out.account;
    });
    // ----- Mail -----
    handle(IPC_CHANNELS.mailListFolders, async (_e, accountId) => {
        return ctx.db.listFolders(accountId);
    });
    handle(IPC_CHANNELS.mailListThreads, async (_e, input) => {
        return ctx.db.listThreads({ accountId: input.accountId, limit: input.limit, offset: input.offset });
    });
    handle(IPC_CHANNELS.mailListMessages, async (_e, input) => {
        return ctx.db.listMessages(input);
    });
    handle(IPC_CHANNELS.mailGetMessage, async (_e, id) => {
        const cached = ctx.db.getMessage(id);
        if (cached)
            return cached;
        const [accountId, folderId, uid] = id.split(':');
        if (!accountId || !folderId || !uid)
            throw new Error('Invalid message id');
        const provider = await ctx.getMailProvider(accountId);
        if (!provider)
            throw new Error('Provider unavailable');
        const folderFull = `${accountId}:${folderId}`;
        const msg = await provider.getMessage(folderFull, uid);
        ctx.db.upsertMessages([msg]);
        return msg;
    });
    handle(IPC_CHANNELS.mailSend, async (_e, draft) => {
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Exponential backoff: 1m, 2m, 4m, 8m, 16m — capped at max_attempts.
            const attempts = Math.max(1, enqueued.created ? 1 : 1);
            const retryDelayMs = Math.min(60_000 * Math.pow(2, attempts - 1), 16 * 60_000);
            ctx.db.markSendFailed(enqueued.id, msg, Date.now(), retryDelayMs);
            throw err;
        }
    });
    handle(IPC_CHANNELS.mailSaveDraft, async (_e, draft) => {
        const provider = await ctx.getMailProvider(draft.accountId);
        if (!provider)
            throw new Error('Provider unavailable');
        return provider.saveDraft(draft);
    });
    handle(IPC_CHANNELS.mailSetFlag, async (_e, input) => {
        const [accountId, folderShort, uid] = input.id.split(':');
        if (!accountId || !folderShort || !uid)
            throw new Error('Invalid message id');
        const folderId = `${accountId}:${folderShort}`;
        const provider = await ctx.getMailProvider(accountId);
        await provider?.setFlag({ folderId, uid, flag: input.flag }).catch(() => undefined);
        if (input.flag === 'read')
            ctx.db.setMessageFlags(input.id, { unread: false });
        if (input.flag === 'unread')
            ctx.db.setMessageFlags(input.id, { unread: true });
        if (input.flag === 'star')
            ctx.db.setMessageFlags(input.id, { flagged: true });
        if (input.flag === 'unstar')
            ctx.db.setMessageFlags(input.id, { flagged: false });
    });
    handle(IPC_CHANNELS.mailSnooze, async (_e, input) => {
        ctx.db.setMessageFlags(input.id, { snoozedUntil: input.until });
        ctx.scheduler.schedule({
            kind: 'snooze-wake',
            fireAt: input.until,
            payload: { messageId: input.id, subject: 'A snoozed email is ready' },
        });
    });
    handle(IPC_CHANNELS.mailSearch, async (_e, query) => {
        const local = ctx.db.searchMessages(query, 100);
        if (local.length > 0)
            return local;
        const providers = await ctx.getAllMailProviders();
        const all = [];
        for (const p of providers) {
            const heads = await p.search(query).catch(() => []);
            for (const h of heads) {
                all.push({ ...h, body: {}, attachments: [] });
            }
        }
        ctx.db.upsertMessages(all);
        return all.map((m) => ({ ...m, body: undefined, attachments: undefined }));
    });
    handle(IPC_CHANNELS.mailRefreshAll, async () => {
        await syncAllMail(ctx);
    });
    // ---- Mail actions (archive / trash / move / mark / spam / reply / forward / print) ----
    handle(IPC_CHANNELS.mailMove, async (_e, input) => {
        return moveMessage(ctx, input.id, input.folderId);
    });
    handle(IPC_CHANNELS.mailArchive, async (_e, input) => {
        return moveToRoleFolder(ctx, input.id, 'archive');
    });
    handle(IPC_CHANNELS.mailTrash, async (_e, input) => {
        return moveToRoleFolder(ctx, input.id, 'trash');
    });
    handle(IPC_CHANNELS.mailMarkRead, async (_e, input) => {
        const [accountId, folderShort, uid] = input.id.split(':');
        if (!accountId || !folderShort || !uid)
            throw new Error('Invalid message id');
        const folderId = `${accountId}:${folderShort}`;
        const provider = await ctx.getMailProvider(accountId);
        await provider?.setFlag({ folderId, uid, flag: input.read ? 'read' : 'unread' }).catch(() => undefined);
        ctx.db.setMessageFlags(input.id, { unread: !input.read });
    });
    handle(IPC_CHANNELS.mailMarkSpam, async (_e, input) => {
        const [accountId, folderShort, uid] = input.id.split(':');
        if (!accountId || !folderShort || !uid)
            throw new Error('Invalid message id');
        const folderId = `${accountId}:${folderShort}`;
        const provider = await ctx.getMailProvider(accountId);
        if (!provider)
            throw new Error('Provider unavailable');
        const previousFolderId = folderId;
        if (provider.reportSpam) {
            await provider.reportSpam({ folderId, uid });
            ctx.db.deleteMessage?.(input.id);
            return { ok: true, newId: input.id, previousFolderId };
        }
        // Fall back to a folder move into the account's spam folder.
        return moveToRoleFolder(ctx, input.id, 'spam');
    });
    handle(IPC_CHANNELS.mailReply, async (_e, input) => {
        const message = ctx.db.getMessage(input.id);
        if (!message)
            throw new Error('Message not found');
        return buildReplyDraft(ctx, message, input.all);
    });
    handle(IPC_CHANNELS.mailForward, async (_e, input) => {
        const message = ctx.db.getMessage(input.id);
        if (!message)
            throw new Error('Message not found');
        return buildForwardDraft(message);
    });
    handle(IPC_CHANNELS.mailPrint, async (_e, input) => {
        const message = ctx.db.getMessage(input.id);
        if (!message)
            throw new Error('Message not found');
        await printMessage(message);
    });
    // ----- Calendar -----
    handle(IPC_CHANNELS.calListCalendars, () => ctx.db.listCalendars());
    handle(IPC_CHANNELS.calListEvents, async (_e, input) => {
        await syncAllCalendars(ctx, input.from, input.to).catch(() => undefined);
        return ctx.db.listEvents(input);
    });
    handle(IPC_CHANNELS.calCreate, async (_e, event) => {
        const provider = await ctx.getCalendarProvider(event.accountId);
        if (provider) {
            const created = await provider.createEvent(event);
            ctx.db.upsertEvents([created]);
            scheduleEventReminders(ctx, created);
            return created;
        }
        const local = { ...event, id: `local:${randomUUID()}` };
        ctx.db.upsertEvents([local]);
        scheduleEventReminders(ctx, local);
        return local;
    });
    handle(IPC_CHANNELS.calUpdate, async (_e, event) => {
        const provider = await ctx.getCalendarProvider(event.accountId);
        if (provider && !event.id.startsWith('local:')) {
            const updated = await provider.updateEvent(event);
            ctx.db.upsertEvents([updated]);
            return updated;
        }
        ctx.db.upsertEvents([event]);
        return event;
    });
    handle(IPC_CHANNELS.calDelete, async (_e, id) => {
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
        if (res.canceled || !res.filePaths[0])
            return [];
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
    handle(IPC_CHANNELS.tasksList, (_e, listId) => ctx.db.listTasks(listId));
    handle(IPC_CHANNELS.tasksCreate, async (_e, task) => {
        if (task.listId.startsWith('local:')) {
            const created = { ...task, id: `local:${randomUUID()}`, position: Date.now() };
            ctx.db.upsertTasks([created]);
            scheduleTaskDue(ctx, created);
            return created;
        }
        const provider = await ctx.getTaskProvider(task.accountId);
        if (!provider)
            throw new Error('Provider unavailable');
        const created = await provider.createTask(task);
        ctx.db.upsertTasks([created]);
        scheduleTaskDue(ctx, created);
        return created;
    });
    handle(IPC_CHANNELS.tasksUpdate, async (_e, task) => {
        if (task.id.startsWith('local:')) {
            ctx.db.upsertTasks([task]);
            return task;
        }
        const provider = await ctx.getTaskProvider(task.accountId);
        if (provider)
            await provider.updateTask(task);
        ctx.db.upsertTasks([task]);
        return task;
    });
    handle(IPC_CHANNELS.tasksDelete, async (_e, id) => {
        if (!id.startsWith('local:')) {
            const accountId = id.split(':')[0];
            if (accountId) {
                const provider = await ctx.getTaskProvider(accountId);
                await provider?.deleteTask(id).catch(() => undefined);
            }
        }
        ctx.db.deleteTask(id);
    });
    handle(IPC_CHANNELS.tasksComplete, async (_e, id) => {
        const all = ctx.db.listTasks();
        const found = all.find((t) => t.id === id);
        if (!found)
            throw new Error('Task not found');
        const updated = { ...found, status: 'completed', completedAt: Date.now() };
        ctx.db.upsertTasks([updated]);
        if (!id.startsWith('local:')) {
            const provider = await ctx.getTaskProvider(found.accountId);
            await provider?.updateTask(updated).catch(() => undefined);
        }
        return updated;
    });
    handle(IPC_CHANNELS.tasksReopen, async (_e, id) => {
        const all = ctx.db.listTasks();
        const found = all.find((t) => t.id === id);
        if (!found)
            throw new Error('Task not found');
        const updated = { ...found, status: 'open', completedAt: undefined };
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
    handle(IPC_CHANNELS.focusStart, (_e, input) => {
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
    handle(IPC_CHANNELS.schedulerCancel, (_e, id) => ctx.scheduler.cancel(id));
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
        if (heur.length === 0)
            return heur;
        const settings = ctx.getSettings();
        if (settings.ai.mode === 'off')
            return heur;
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
            if (!client)
                return heur;
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
                if (!v)
                    return s;
                if (v.verdict === 'keep')
                    return null;
                return { ...s, aiVerdict: v.verdict, aiConfidence: v.confidence, aiReason: v.reason };
            })
                .filter((x) => Boolean(x));
            return filtered;
        }
        catch {
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
        if (!ctx.updater)
            return { available: false, error: 'Updater unavailable' };
        return ctx.updater.checkNow();
    });
    handle(IPC_CHANNELS.updatesDownload, async () => {
        if (!ctx.updater)
            return { ok: false, error: 'Updater unavailable' };
        return ctx.updater.downloadAndInstallOnQuit();
    });
}
function persistOAuth(ctx, account, tokens) {
    const config = {};
    const secrets = {};
    if (typeof tokens['access_token'] === 'string')
        secrets['access_token'] = tokens['access_token'];
    if (typeof tokens['refresh_token'] === 'string')
        secrets['refresh_token'] = tokens['refresh_token'];
    if (typeof tokens['home_account_id'] === 'string')
        secrets['home_account_id'] = tokens['home_account_id'];
    ctx.db.upsertAccount(account, JSON.stringify(config));
    ctx.vault.write(account.id, secrets);
}
function scheduleEventReminders(ctx, event) {
    const reminders = event.reminders ?? [10];
    for (const minutes of reminders) {
        const fireAt = event.start - minutes * 60_000;
        if (fireAt < Date.now())
            continue;
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
function scheduleTaskDue(ctx, task) {
    if (!task.due)
        return;
    const fireAt = task.due;
    if (fireAt < Date.now())
        return;
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
async function moveMessage(ctx, id, targetFolderId) {
    const [accountId, folderShort, uid] = id.split(':');
    if (!accountId || !folderShort || !uid)
        throw new Error('Invalid message id');
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
async function moveToRoleFolder(ctx, id, role) {
    const accountId = id.split(':')[0];
    if (!accountId)
        throw new Error('Invalid message id');
    const folders = await ctx.db.listFolders(accountId);
    let target = folders.find((f) => f.role === role);
    if (!target) {
        // Pull a fresh folder list from the provider in case the local cache
        // hasn't seen the destination folder yet.
        const provider = await ctx.getMailProvider(accountId);
        if (provider) {
            const remote = await provider.listFolders().catch(() => []);
            target = remote.find((f) => f.role === role);
        }
    }
    if (!target) {
        throw new Error(`No ${role} folder found for this account.`);
    }
    return moveMessage(ctx, id, target.id);
}
/** Build a reply (or reply-all) Draft from the cached Message. */
function buildReplyDraft(ctx, m, all) {
    const account = ctx.db.listAccounts().find((a) => a.id === m.accountId);
    const subject = m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`;
    const toList = [m.from];
    const ccList = all
        ? dedupAddresses([...(m.to ?? []), ...(m.cc ?? [])].filter((a) => a.email && a.email.toLowerCase() !== account?.emailAddress.toLowerCase()))
        : [];
    const references = [...(m.references ?? []), m.inReplyTo].filter(Boolean);
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
function buildForwardDraft(m) {
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
function quoteBody(m, forward = false) {
    const sentAt = new Date(m.date).toLocaleString();
    const header = forward
        ? `From: ${formatAddress(m.from)}\nDate: ${sentAt}\nSubject: ${m.subject}\nTo: ${(m.to ?? []).map(formatAddress).join(', ')}\n\n`
        : `On ${sentAt}, ${formatAddress(m.from)} wrote:\n\n`;
    const text = `${header}${(m.body?.text ?? m.snippet ?? '').split('\n').map((l) => `> ${l}`).join('\n')}\n`;
    const html = `<br><br><blockquote style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex"><div>${escapeHtml(header).replace(/\n/g, '<br>')}</div>${m.body?.html ?? `<pre>${escapeHtml(m.body?.text ?? m.snippet ?? '')}</pre>`}</blockquote>`;
    return { text, html };
}
function formatAddress(a) {
    return a.name ? `"${a.name}" <${a.email}>` : a.email;
}
function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c));
}
function dedupAddresses(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
        const key = it.email.toLowerCase();
        if (!key || seen.has(key))
            continue;
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
async function printMessage(m) {
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
        await new Promise((resolve, reject) => {
            win.webContents.print({ silent: false, printBackground: true }, (ok, err) => {
                if (ok)
                    resolve();
                else
                    reject(new Error(err || 'Print cancelled'));
            });
        });
    }
    finally {
        if (!win.isDestroyed())
            win.close();
    }
}
//# sourceMappingURL=register.js.map