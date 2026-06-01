import type { Account, ChatConversation, ChatMessage, ChatUser } from '@gingermail/core';
import type { ChatIdentity, ChatProvider, Unsubscribe } from '../types.js';

const DISCORD_API = 'https://discord.com/api/v10';

/** Discord channel type ids we surface as chat conversations. */
const GUILD_TEXT = 0;
const GUILD_ANNOUNCEMENT = 5;

interface DiscordApiError {
  message?: string;
  code?: number;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  bot?: boolean;
}

interface DiscordGuild {
  id: string;
  name: string;
}

interface DiscordChannel {
  id: string;
  name?: string;
  type: number;
  guild_id?: string;
}

interface DiscordMessage {
  id: string;
  channel_id?: string;
  content: string;
  author: DiscordUser;
  timestamp: string;
  mentions?: DiscordUser[];
}

/**
 * Discord chat provider. Mirrors the {@link SlackProvider} read/write split but
 * for a Discord BOT token. Request/response methods (list/send/etc.) use the
 * REST API over HTTPS from the main process; real-time delivery uses the
 * Gateway WebSocket via {@link DiscordProvider.watch}.
 *
 * A bot only sees guilds (servers) it has been invited to plus DMs sent to the
 * bot. It cannot read the user's personal DMs — that would require a user/self
 * token, which violates Discord's ToS. One connected account == one bot token;
 * every guild's text channels become conversations.
 */
export class DiscordProvider implements ChatProvider {
  private identity: ChatIdentity | null = null;
  private gateway: { destroy(): Promise<unknown> | void } | null = null;
  private gatewayDisposed = false;

  constructor(
    private readonly account: Account,
    private readonly token: string,
  ) {}

  async authTest(): Promise<ChatIdentity> {
    if (this.identity) return this.identity;
    const me = await this.call<DiscordUser>('GET', '/users/@me');
    const name = me.global_name || me.username || me.id;
    this.identity = {
      teamId: me.id,
      teamName: name,
      userId: me.id,
      userName: name,
    };
    return this.identity;
  }

  async listConversations(): Promise<ChatConversation[]> {
    await this.authTest();
    const guilds = await this.call<DiscordGuild[]>('GET', '/users/@me/guilds');
    const out: ChatConversation[] = [];
    for (const g of guilds) {
      const channels = await this.call<DiscordChannel[]>('GET', `/guilds/${g.id}/channels`).catch(() => [] as DiscordChannel[]);
      for (const ch of channels) {
        if (ch.type !== GUILD_TEXT && ch.type !== GUILD_ANNOUNCEMENT) continue;
        out.push(toConversation(this.account.id, g, ch));
      }
    }
    return out;
  }

  async listMessages(conversationId: string, limit = 50): Promise<ChatMessage[]> {
    const identity = await this.authTest();
    const capped = Math.min(Math.max(limit, 1), 100);
    const messages = await this.call<DiscordMessage[]>(
      'GET',
      `/channels/${conversationId}/messages?limit=${capped}`,
    );
    return messages
      .map((m) => toMessage(this.account.id, conversationId, m, identity.userId))
      // Discord returns newest-first; flip to chronological for the UI.
      .reverse();
  }

  async sendMessage(conversationId: string, text: string): Promise<ChatMessage> {
    const identity = await this.authTest();
    const sent = await this.call<DiscordMessage>('POST', `/channels/${conversationId}/messages`, {
      content: text,
    });
    return toMessage(this.account.id, conversationId, sent, identity.userId);
  }

  async markRead(): Promise<void> {
    // Bots have no server-side read state; unread is tracked locally by the
    // sync layer against `last_read_ts`, same as Slack.
  }

  async listUsers(): Promise<ChatUser[]> {
    // Discord messages already embed the author's name, so we don't need a
    // separate roster fetch (which would require the privileged GUILD_MEMBERS
    // intent). Author names are resolved per-message in `toMessage`.
    return [];
  }

  watch(onMessage: (message: ChatMessage) => void): Unsubscribe {
    this.gatewayDisposed = false;
    void this.startGateway(onMessage).catch(() => undefined);
    return () => {
      this.gatewayDisposed = true;
      const gw = this.gateway;
      this.gateway = null;
      if (gw) void gw.destroy();
    };
  }

  private async startGateway(onMessage: (message: ChatMessage) => void): Promise<void> {
    const identity = await this.authTest();
    // discord.js is imported lazily so the provider's pure mapping helpers stay
    // importable (and unit-testable) without pulling in the Gateway stack.
    const { Client, GatewayIntentBits, Events } = await import('discord.js');
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
    client.on(Events.MessageCreate, (msg) => {
      try {
        onMessage(mapGatewayMessage(this.account.id, identity.userId, msg));
      } catch {
        /* ignore malformed gateway payloads */
      }
    });
    // If unsubscribe already fired before login completed, tear down now.
    if (this.gatewayDisposed) {
      void client.destroy();
      return;
    }
    this.gateway = client;
    await client.login(this.token);
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${DISCORD_API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const err = (await res.json()) as DiscordApiError;
        detail = err.message ? `: ${err.message}` : '';
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Discord ${method} ${path} HTTP ${res.status}${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

/** Convert a Discord snowflake id to epoch milliseconds. */
export function snowflakeToMs(id: string): number {
  // Discord epoch is 2015-01-01T00:00:00Z (1420070400000); the timestamp is the
  // high 42 bits of the snowflake. Use BigInt to avoid float precision loss.
  try {
    return Number((BigInt(id) >> 22n) + 1420070400000n);
  } catch {
    return 0;
  }
}

function displayName(u: DiscordUser): string {
  return u.global_name || u.username || u.id;
}

export function toConversation(
  accountId: string,
  guild: DiscordGuild,
  channel: DiscordChannel,
): ChatConversation {
  const channelName = channel.name ? `#${channel.name}` : '(unknown)';
  return {
    id: `${accountId}:${channel.id}`,
    accountId,
    conversationId: channel.id,
    kind: 'channel',
    name: `${guild.name} ${channelName}`,
    unreadCount: 0,
    hasMention: false,
    lastMessageAt: 0,
    isMember: true,
  };
}

export function toMessage(
  accountId: string,
  conversationId: string,
  m: DiscordMessage,
  selfId: string,
): ChatMessage {
  const links = extractLinks(m.content ?? '');
  const mentionsMe = (m.mentions ?? []).some((u) => u.id === selfId);
  return {
    id: `${accountId}:${conversationId}:${m.id}`,
    accountId,
    conversationId,
    ts: m.id,
    userId: m.author?.id,
    authorName: m.author ? displayName(m.author) : 'system',
    text: m.content ?? '',
    createdAt: m.timestamp ? Date.parse(m.timestamp) || snowflakeToMs(m.id) : snowflakeToMs(m.id),
    mentionsMe,
    links: links.length ? links : undefined,
  };
}

/** Map a discord.js Gateway `Message` object into our normalized shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGatewayMessage(accountId: string, selfId: string, msg: any): ChatMessage {
  const content: string = msg?.content ?? '';
  const author = msg?.author;
  const authorName: string = author?.globalName || author?.username || author?.id || 'system';
  const channelId: string = msg?.channelId ?? msg?.channel_id ?? '';
  const id: string = msg?.id ?? '';
  let mentionsMe = false;
  try {
    mentionsMe = Boolean(msg?.mentions?.users?.has?.(selfId));
  } catch {
    mentionsMe = false;
  }
  const links = extractLinks(content);
  return {
    id: `${accountId}:${channelId}:${id}`,
    accountId,
    conversationId: channelId,
    ts: id,
    userId: author?.id,
    authorName,
    text: content,
    createdAt: typeof msg?.createdTimestamp === 'number' ? msg.createdTimestamp : snowflakeToMs(id),
    mentionsMe,
    links: links.length ? links : undefined,
  };
}

function extractLinks(text: string): string[] {
  const links: string[] = [];
  const re = /https?:\/\/[^\s<>]+/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    links.push(match[0]);
  }
  return links;
}
