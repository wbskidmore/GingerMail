import { describe, expect, it } from 'vitest';
import type { ChatUser } from '@gingermail/core';
import { flattenMrkdwn } from './index.js';

const users = new Map<string, ChatUser>([
  [
    'U123',
    {
      id: 'a:U123',
      accountId: 'a',
      userId: 'U123',
      displayName: 'Ada Lovelace',
      initials: 'AL',
      isBot: false,
    },
  ],
]);

describe('flattenMrkdwn', () => {
  it('resolves user mentions to display names', () => {
    expect(flattenMrkdwn('hey <@U123> ping', users).text).toBe('hey @Ada Lovelace ping');
  });

  it('falls back to the raw id when the user is unknown', () => {
    expect(flattenMrkdwn('yo <@U999>', users).text).toBe('yo @U999');
  });

  it('renders channel mentions as #name', () => {
    expect(flattenMrkdwn('see <#C1|general>', users).text).toBe('see #general');
  });

  it('uses the label for links and collects the url', () => {
    const out = flattenMrkdwn('read <https://example.com|the docs>', users);
    expect(out.text).toBe('read the docs');
    expect(out.links).toEqual(['https://example.com']);
  });

  it('keeps bare links as text and collects them', () => {
    const out = flattenMrkdwn('<https://example.com>', users);
    expect(out.text).toBe('https://example.com');
    expect(out.links).toEqual(['https://example.com']);
  });

  it('maps special mentions like <!here>', () => {
    expect(flattenMrkdwn('<!here> standup', users).text).toBe('@here standup');
  });

  it('decodes html entities Slack escapes', () => {
    expect(flattenMrkdwn('a &amp; b &lt; c', users).text).toBe('a & b < c');
  });
});
