import { describe, expect, it } from 'vitest';
import { snowflakeToMs, toConversation, toMessage } from './index.js';

describe('snowflakeToMs', () => {
  it('decodes the Discord epoch from a snowflake', () => {
    // Snowflake 175928847299117063 -> 2016-04-30T11:18:25.796Z per Discord docs.
    expect(snowflakeToMs('175928847299117063')).toBe(1462015105796);
  });

  it('returns 0 for a non-numeric id', () => {
    expect(snowflakeToMs('not-a-snowflake')).toBe(0);
  });
});

describe('toConversation', () => {
  it('prefixes the channel with its guild name and # marker', () => {
    const c = toConversation(
      'discord:bot1',
      { id: 'G1', name: 'Acme' },
      { id: 'C1', name: 'general', type: 0 },
    );
    expect(c).toMatchObject({
      id: 'discord:bot1:C1',
      accountId: 'discord:bot1',
      conversationId: 'C1',
      kind: 'channel',
      name: 'Acme #general',
      isMember: true,
    });
  });
});

describe('toMessage', () => {
  const base = {
    id: '900000000000000000',
    content: 'ship it https://example.com/pr/1',
    author: { id: 'U1', username: 'ada', global_name: 'Ada Lovelace' },
    timestamp: '2026-05-01T10:00:00.000Z',
  };

  it('maps a Discord message to the normalized shape and extracts links', () => {
    const m = toMessage('discord:bot1', 'C1', base, 'BOT');
    expect(m).toMatchObject({
      id: 'discord:bot1:C1:900000000000000000',
      accountId: 'discord:bot1',
      conversationId: 'C1',
      ts: '900000000000000000',
      userId: 'U1',
      authorName: 'Ada Lovelace',
      mentionsMe: false,
    });
    expect(m.links).toEqual(['https://example.com/pr/1']);
    expect(m.createdAt).toBe(Date.parse('2026-05-01T10:00:00.000Z'));
  });

  it('flags mentionsMe when the bot id appears in mentions', () => {
    const m = toMessage(
      'discord:bot1',
      'C1',
      { ...base, mentions: [{ id: 'BOT', username: 'gingermail' }] },
      'BOT',
    );
    expect(m.mentionsMe).toBe(true);
  });

  it('falls back to username when global_name is absent', () => {
    const m = toMessage(
      'discord:bot1',
      'C1',
      { ...base, author: { id: 'U2', username: 'bob' } },
      'BOT',
    );
    expect(m.authorName).toBe('bob');
  });
});
