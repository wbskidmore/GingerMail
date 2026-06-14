import type { Account, ChatConversation, ChatMessage, ChatUser } from '@gingermail/core';
import type { ChatIdentity, ChatProvider } from '../types.js';

const SLACK_API = 'https://slack.com/api';

interface SlackApiError {
  ok: false;
  error: string;
}

interface SlackAuthTest {
  ok: true;
  url: string;
  team: string;
  user: string;
  team_id: string;
  user_id: string;
}

interface SlackConversation {
  id: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_channel?: boolean;
  is_group?: boolean;
  is_private?: boolean;
  is_member?: boolean;
  user?: string; // partner user id for IMs
  latest?: { ts?: string };
}

interface SlackHistoryMessage {
  type: string;
  subtype?: string;
  ts: string;
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
}

interface SlackUser {
  id: string;
  name?: string;
  is_bot?: boolean;
  deleted?: boolean;
  profile?: { display_name?: string; real_name?: string };
  real_name?: string;
}

/**
 * Slack chat provider. Talks to the Slack Web API over HTTPS from the main
 * process only. A user token (xoxp-…) sees the signed-in user's DMs +
 * channels; a bot token (xoxb-…) is also accepted but only sees what the
 * bot is a member of. Unread state is computed by the sync layer against a
 * locally-stored last-read marker, so this provider stays read-light.
 */
export class SlackProvider implements ChatProvider {
  private identity: ChatIdentity | null = null;
  private userCache: Map<string, ChatUser> | null = null;

  constructor(
    private readonly account: Account,
    private readonly token: string,
  ) {}

  async authTest(): Promise<ChatIdentity> {
    if (this.identity) return this.identity;
    const res = await this.call<SlackAuthTest>('auth.test');
    this.identity = {
      teamId: res.team_id,
      teamName: res.team,
      userId: res.user_id,
      userName: res.user,
    };
    // Best-effort email enrichment; ignored when the token lacks users:read.
    try {
      const info = await this.call<{
        ok: true;
        user: SlackUser & { profile?: { email?: string } };
      }>('users.info', { user: res.user_id });
      const email = info.user.profile?.email;
      if (email) this.identity = { ...this.identity, email };
    } catch {
      /* users:read.email not granted; leave email undefined */
    }
    return this.identity;
  }

  async listConversations(): Promise<ChatConversation[]> {
    const identity = await this.authTest();
    const users = await this.ensureUsers();
    const res = await this.call<{ ok: true; channels: SlackConversation[] }>(
      'users.conversations',
      {
        types: 'public_channel,private_channel,mpim,im',
        exclude_archived: 'true',
        limit: '200',
      },
    );
    return res.channels.map((c) => this.toConversation(c, users, identity));
  }

  async listMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
    const identity = await this.authTest();
    const users = await this.ensureUsers();
    const res = await this.call<{ ok: true; messages: SlackHistoryMessage[] }>(
      'conversations.history',
      {
        channel: conversationId,
        limit: String(Math.min(Math.max(limit, 1), 200)),
      },
    );
    return (
      res.messages
        .filter((m) => m.type === 'message')
        .map((m) => this.toMessage(conversationId, m, users, identity))
        // Slack returns newest-first; flip to chronological for the UI.
        .reverse()
    );
  }

  async sendMessage(conversationId: string, text: string): Promise<ChatMessage> {
    const identity = await this.authTest();
    const users = await this.ensureUsers();
    const res = await this.call<{ ok: true; ts: string; message: SlackHistoryMessage }>(
      'chat.postMessage',
      {
        channel: conversationId,
        text,
      },
    );
    const raw: SlackHistoryMessage = res.message ?? {
      type: 'message',
      ts: res.ts,
      user: identity.userId,
      text,
    };
    return this.toMessage(conversationId, raw, users, identity);
  }

  async markRead(conversationId: string, ts?: string): Promise<void> {
    // `conversations.mark` requires a ts; when omitted, mark to the latest.
    let markTs = ts;
    if (!markTs) {
      const res = await this.call<{ ok: true; messages: SlackHistoryMessage[] }>(
        'conversations.history',
        {
          channel: conversationId,
          limit: '1',
        },
      );
      markTs = res.messages[0]?.ts;
    }
    if (!markTs) return;
    await this.call('conversations.mark', { channel: conversationId, ts: markTs }).catch(
      () => undefined,
    );
  }

  async listUsers(): Promise<ChatUser[]> {
    const map = await this.ensureUsers();
    return Array.from(map.values());
  }

  // ---- internals ----

  private async ensureUsers(): Promise<Map<string, ChatUser>> {
    if (this.userCache) return this.userCache;
    const map = new Map<string, ChatUser>();
    try {
      const res = await this.call<{ ok: true; members: SlackUser[] }>('users.list', {
        limit: '1000',
      });
      for (const u of res.members) {
        if (u.deleted) continue;
        const displayName =
          u.profile?.display_name || u.profile?.real_name || u.real_name || u.name || u.id;
        map.set(u.id, {
          id: `${this.account.id}:${u.id}`,
          accountId: this.account.id,
          userId: u.id,
          displayName,
          initials: initialsOf(displayName),
          isBot: Boolean(u.is_bot),
        });
      }
    } catch {
      /* users:read not granted; names fall back to raw ids */
    }
    this.userCache = map;
    return map;
  }

  private toConversation(
    c: SlackConversation,
    users: Map<string, ChatUser>,
    identity: ChatIdentity,
  ): ChatConversation {
    const kind: ChatConversation['kind'] = c.is_im
      ? 'im'
      : c.is_mpim
        ? 'mpim'
        : c.is_group || c.is_private
          ? 'group'
          : 'channel';
    let name = c.name ? `#${c.name}` : '(unknown)';
    if (c.is_im && c.user) {
      name = users.get(c.user)?.displayName ?? c.user;
    } else if (c.is_mpim && c.name) {
      name = c.name
        .replace(/^mpdm-/, '')
        .replace(/-1$/, '')
        .replace(/--/g, ', ');
    }
    void identity;
    return {
      id: `${this.account.id}:${c.id}`,
      accountId: this.account.id,
      conversationId: c.id,
      kind,
      name,
      partnerUserId: c.is_im ? c.user : undefined,
      unreadCount: 0,
      hasMention: false,
      lastMessageAt: c.latest?.ts ? tsToMs(c.latest.ts) : 0,
      isMember: c.is_member ?? c.is_im ?? c.is_mpim ?? false,
    };
  }

  private toMessage(
    conversationId: string,
    m: SlackHistoryMessage,
    users: Map<string, ChatUser>,
    identity: ChatIdentity,
  ): ChatMessage {
    const authorName = m.user
      ? (users.get(m.user)?.displayName ?? m.user)
      : (m.username ?? (m.bot_id ? 'bot' : 'system'));
    const { text, links } = flattenMrkdwn(m.text ?? '', users);
    const mentionsMe = (m.text ?? '').includes(`<@${identity.userId}>`);
    return {
      id: `${this.account.id}:${conversationId}:${m.ts}`,
      accountId: this.account.id,
      conversationId,
      ts: m.ts,
      userId: m.user,
      authorName,
      text,
      createdAt: tsToMs(m.ts),
      mentionsMe,
      links: links.length ? links : undefined,
    };
  }

  private async call<T>(method: string, params: Record<string, string> = {}): Promise<T> {
    const body = new URLSearchParams(params).toString();
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Slack ${method} HTTP ${res.status}`);
    }
    const json = (await res.json()) as T | SlackApiError;
    if ((json as SlackApiError).ok === false) {
      throw new Error(`Slack ${method} failed: ${(json as SlackApiError).error}`);
    }
    return json as T;
  }
}

/** Convert a Slack `"1700000000.000100"` timestamp to epoch milliseconds. */
function tsToMs(ts: string): number {
  const seconds = parseFloat(ts);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
}

function initialsOf(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Flatten Slack mrkdwn into readable plain text and collect any http(s)
 * links. We deliberately do NOT render HTML; the renderer shows plain text +
 * link affordances to keep the message pane low-stimulation and CSP-safe.
 *
 *   <@U123>            -> @DisplayName
 *   <#C123|general>    -> #general
 *   <https://x|label>  -> label   (and https://x added to links[])
 *   <https://x>        -> https://x
 *   <!here>/<!channel> -> @here / @channel
 */
export function flattenMrkdwn(
  raw: string,
  users: Map<string, ChatUser>,
): { text: string; links: string[] } {
  const links: string[] = [];
  const text = raw.replace(/<([^>]+)>/g, (_full, inner: string) => {
    if (inner.startsWith('@')) {
      const id = inner.slice(1).split('|')[0]!;
      return `@${users.get(id)?.displayName ?? id}`;
    }
    if (inner.startsWith('#')) {
      const parts = inner.slice(1).split('|');
      return `#${parts[1] ?? parts[0]}`;
    }
    if (inner.startsWith('!')) {
      const label = inner.slice(1).split('|')[0]!;
      return `@${label}`;
    }
    const [url, label] = inner.split('|');
    if (url && /^https?:\/\//i.test(url)) links.push(url);
    return label ?? url ?? inner;
  });
  return { text: decodeEntities(text), links };
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
