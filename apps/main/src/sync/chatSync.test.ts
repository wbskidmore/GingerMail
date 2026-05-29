import { describe, expect, it, vi } from 'vitest';

// chatSync imports electronShim at module load (Notification/log). Mock it so
// the pure gating helper can be imported in a plain Node test.
vi.mock('../electronShim.js', () => ({
  Notification: { isSupported: () => false },
  log: { warn: () => {}, info: () => {} },
}));

const { buildChatNotification } = await import('./chatSync.js');

const base = {
  dms: 0,
  mentions: 0,
  focusActive: false,
  notificationsEnabled: true,
  notifyOnDirectMessage: true,
  notifyOnMention: true,
};

describe('buildChatNotification', () => {
  it('suppresses everything during Focus Mode', () => {
    expect(buildChatNotification({ ...base, dms: 3, focusActive: true }).show).toBe(false);
  });

  it('suppresses everything when notifications are globally off', () => {
    expect(buildChatNotification({ ...base, mentions: 2, notificationsEnabled: false }).show).toBe(false);
  });

  it('does not notify when there is nothing new', () => {
    expect(buildChatNotification(base).show).toBe(false);
  });

  it('respects the per-type opt-outs', () => {
    expect(buildChatNotification({ ...base, dms: 2, notifyOnDirectMessage: false }).show).toBe(false);
    expect(buildChatNotification({ ...base, mentions: 2, notifyOnMention: false }).show).toBe(false);
  });

  it('batches DMs and mentions into a single body', () => {
    const out = buildChatNotification({ ...base, dms: 2, mentions: 1 });
    expect(out.show).toBe(true);
    expect(out.body).toBe('2 new direct messages \u00b7 1 mention');
  });

  it('uses singular wording for a single item', () => {
    expect(buildChatNotification({ ...base, dms: 1 }).body).toBe('1 new direct message');
  });
});
