import { IPC_CHANNELS, defaultChatSettings, type ChatMessage } from '@gingermail/core';
import type { ChatProvider } from '@gingermail/providers';
import { Notification, log } from '../electronShim.js';
import type { AppContext } from '../context.js';

/**
 * Poll-based Slack sync. For each connected workspace we refresh the user
 * roster + conversation list, pull recent history per conversation, and
 * derive unread/mention state from a LOCAL read marker (`last_read_ts`).
 *
 * ADHD-friendly notification rules (all enforced here):
 *   - Focus Mode suppresses every Slack ping.
 *   - Only DMs (when `notifyOnDirectMessage`) and @-mentions (when
 *     `notifyOnMention`) ping; channel chatter never does.
 *   - Pings are BATCHED into a single per-workspace notification per poll,
 *     never one-per-message.
 *   - On first sight of a conversation we seed the read marker to its latest
 *     message so the user doesn't get buried under historical "unread".
 */

const inFlight = new Map<string, Promise<void>>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;

export async function syncAllChat(ctx: AppContext): Promise<void> {
  const chat = ctx.getSettings().chat ?? defaultChatSettings;
  if (!chat.enabled) return;
  const providers = await ctx.getAllChatProviders();
  await Promise.all(providers.map((p) => syncWorkspace(ctx, p.accountId, p.provider)));
}

function syncWorkspace(ctx: AppContext, accountId: string, provider: ChatProvider): Promise<void> {
  const existing = inFlight.get(accountId);
  if (existing) return existing;
  const p = doSyncWorkspace(ctx, accountId, provider).finally(() => inFlight.delete(accountId));
  inFlight.set(accountId, p);
  return p;
}

async function doSyncWorkspace(ctx: AppContext, accountId: string, provider: ChatProvider): Promise<void> {
  ctx.mainWindow?.webContents.send(IPC_CHANNELS.slackSyncEvent, { type: 'started', accountId });
  try {
    const identity = await provider.authTest();
    const selfId = identity.userId;

    const users = await provider.listUsers().catch(() => []);
    if (users.length) ctx.db.upsertChatUsers(users);

    const conversations = await provider.listConversations();
    ctx.db.upsertChatConversations(conversations);

    let newDmCount = 0;
    let newMentionCount = 0;

    for (const c of conversations) {
      // Bound the call count: always pull DMs/group-DMs, but only channels
      // the user actually belongs to (browsable-but-unjoined channels would
      // otherwise cost a history call each with no unread value).
      if (c.kind === 'channel' && !c.isMember) continue;

      const messages = await provider.listMessages(c.conversationId, 30).catch(() => [] as ChatMessage[]);
      if (messages.length) ctx.db.upsertChatMessages(messages);

      const lastRead = ctx.db.getChatLastRead(accountId, c.conversationId);
      const latestTs = messages.length ? messages[messages.length - 1]!.ts : undefined;

      if (lastRead === undefined) {
        // First sight: seed the marker so we start at zero unread.
        if (latestTs) ctx.db.markChatConversationRead(accountId, c.conversationId, latestTs);
        continue;
      }

      const unread = messages.filter((m) => tsGreater(m.ts, lastRead) && m.userId !== selfId);
      const hasMention = unread.some((m) => m.mentionsMe);
      ctx.db.setChatUnread({
        accountId,
        conversationId: c.conversationId,
        unreadCount: unread.length,
        hasMention,
      });

      // Accumulate batched notification counts.
      if (c.kind === 'im' || c.kind === 'mpim') newDmCount += unread.length;
      else if (hasMention) newMentionCount += unread.filter((m) => m.mentionsMe).length;

      if (unread.length) {
        ctx.mainWindow?.webContents.send(IPC_CHANNELS.slackSyncEvent, {
          type: 'new-message',
          accountId,
          conversationId: c.conversationId,
          mentionsMe: hasMention,
        });
      }
    }

    maybeNotify(ctx, identity.teamName, newDmCount, newMentionCount);

    ctx.mainWindow?.webContents.send(IPC_CHANNELS.slackSyncEvent, { type: 'conversations-updated', accountId });
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.slackSyncEvent, { type: 'finished', accountId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.slackSyncEvent, { type: 'error', accountId, error: message });
    log.warn(`[chatSync] workspace ${accountId} failed: ${message}`);
  }
}

export interface ChatNotifyInputs {
  dms: number;
  mentions: number;
  focusActive: boolean;
  notificationsEnabled: boolean;
  notifyOnDirectMessage: boolean;
  notifyOnMention: boolean;
}

export interface ChatNotifyDecision {
  show: boolean;
  body?: string;
}

/**
 * Pure notification-gating logic, extracted so it can be unit-tested without
 * Electron. Encodes the ADHD-friendly rules: Focus Mode and the global
 * notifications switch hard-suppress everything; otherwise only DMs and
 * mentions the user opted into produce a single batched body string.
 */
export function buildChatNotification(input: ChatNotifyInputs): ChatNotifyDecision {
  if (!input.notificationsEnabled) return { show: false };
  if (input.focusActive) return { show: false }; // Focus Mode suppresses Slack pings.
  const wantDm = input.notifyOnDirectMessage && input.dms > 0;
  const wantMention = input.notifyOnMention && input.mentions > 0;
  if (!wantDm && !wantMention) return { show: false };
  const parts: string[] = [];
  if (wantDm) parts.push(`${input.dms} new direct message${input.dms === 1 ? '' : 's'}`);
  if (wantMention) parts.push(`${input.mentions} mention${input.mentions === 1 ? '' : 's'}`);
  return { show: true, body: parts.join(' \u00b7 ') };
}

function maybeNotify(ctx: AppContext, teamName: string, dms: number, mentions: number): void {
  const settings = ctx.getSettings();
  const chat = settings.chat ?? defaultChatSettings;
  const decision = buildChatNotification({
    dms,
    mentions,
    focusActive: ctx.focusState.active,
    notificationsEnabled: settings.notifications.enabled,
    notifyOnDirectMessage: chat.notifyOnDirectMessage,
    notifyOnMention: chat.notifyOnMention,
  });
  if (!decision.show) return;
  try {
    if (Notification.isSupported()) {
      new Notification({ title: `Slack — ${teamName}`, body: decision.body ?? '' }).show();
    }
  } catch {
    /* notifications unavailable on this platform; non-fatal */
  }
}

/** Numeric comparison of Slack timestamps ("1700000000.000100"). */
function tsGreater(a: string, b: string): boolean {
  return parseFloat(a) > parseFloat(b);
}

/**
 * Start the background poll loop. Re-reads the interval from settings each
 * cycle so changing it in Settings takes effect on the next tick. Safe to
 * call once at startup; a second call is a no-op.
 */
export function startChatPolling(ctx: AppContext): void {
  if (pollTimer) return;
  const tick = (): void => {
    const chat = ctx.getSettings().chat ?? defaultChatSettings;
    const intervalMs = Math.max(15, chat.pollIntervalSec) * 1000;
    void syncAllChat(ctx).catch(() => undefined);
    pollTimer = setTimeout(tick, intervalMs);
  };
  // Kick off after a short delay so first-launch window paint isn't blocked.
  pollTimer = setTimeout(tick, 5_000);
}

export function stopChatPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}
