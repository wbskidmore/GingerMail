import { describe, it, expect } from 'vitest';
import { scrubSecrets, wrapLoggerWithScrub } from './scrub.js';

describe('scrubSecrets', () => {
  it('redacts Authorization: Bearer headers', () => {
    expect(scrubSecrets('Authorization: Bearer sk-abcdef1234567890zzz')).toMatch(/Bearer \*\*\*/);
    expect(scrubSecrets('authorization: bearer eyJhbGciOiJIUzI1NiJ9.payload.sig')).toMatch(
      /bearer \*\*\*/i,
    );
  });

  it('redacts Authorization: Basic headers', () => {
    expect(scrubSecrets('Authorization: Basic Zm9vOmJhcg==')).toMatch(/Basic \*\*\*/);
  });

  it('redacts x-api-key / x-goog-api-key / api-key headers', () => {
    expect(scrubSecrets('x-api-key: sk-1234567890abcdef')).toMatch(/x-api-key: \*\*\*/);
    expect(scrubSecrets('"x-goog-api-key": "AIzaSyABCDEF1234567890abcdef"')).toContain('"***"');
    expect(scrubSecrets('api-key=topsecretvalue')).toMatch(/api-key=\*\*\*/);
  });

  it('redacts access_token / refresh_token / password / client_secret in JSON', () => {
    const json =
      '{"access_token":"ya29.abcd","refresh_token":"1//abcd","client_secret":"shhh","password":"hunter2"}';
    const out = scrubSecrets(json);
    expect(out).not.toContain('ya29.abcd');
    expect(out).not.toContain('1//abcd');
    expect(out).not.toContain('shhh');
    expect(out).not.toContain('hunter2');
  });

  it('redacts ?access_token= in URLs', () => {
    expect(
      scrubSecrets('GET https://api.example.com/v1/me?access_token=abc123def&hl=en'),
    ).toContain('access_token=***');
  });

  it('redacts well-known prefixed tokens (OpenAI, Slack, Google)', () => {
    expect(scrubSecrets('key=sk-abcdef1234567890')).toContain('sk-***');
    expect(scrubSecrets('key=sk-proj-aaaaaaaaaaaaaaaaaaa')).toContain('sk-proj-***');
    expect(scrubSecrets('xoxb-1234567890-abcdefg')).toContain('xoxb-***');
    expect(scrubSecrets('AIzaSy12345678901234567890ABC')).toContain('AIza***');
  });

  it('redacts Discord bot tokens', () => {
    const token = 'MTk4NjIyNDgzNDcxOTI1MjQ4.Gabcde.abcdefghijklmnopqrstuvwxyz123456789';
    const out = scrubSecrets(`bot token: ${token}`);
    expect(out).not.toContain(token);
    expect(out).toContain('discord-***');
  });

  it('redacts JWT-shaped values', () => {
    expect(
      scrubSecrets('token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.aBcDeFgHiJkLmNoP'),
    ).toContain('eyJ***.***.***');
  });

  it('redacts long hex strings (DB keys, API tokens)', () => {
    const fakeKey = 'a'.repeat(64);
    expect(scrubSecrets(`db key: ${fakeKey}`)).toContain('***hex***');
    // Short hex (commit SHA) is untouched.
    expect(scrubSecrets('commit abc1234')).toContain('abc1234');
  });

  it('handles Error instances + arbitrary objects', () => {
    expect(scrubSecrets(new Error('oh no Bearer sk-thisisarealistic1234567token'))).toContain(
      'sk-***',
    );
    // Bearer + sk- both fire; whichever wins the value is redacted.
    const out = scrubSecrets({ headers: { authorization: 'Bearer sk-very-secret-1234abcd' } });
    expect(out).not.toContain('sk-very-secret');
    expect(out).toMatch(/Bearer (sk-)?\*\*\*/);
  });

  it('leaves benign log lines alone', () => {
    expect(scrubSecrets('[main] starting up')).toBe('[main] starting up');
    expect(scrubSecrets({ kind: 'sync', folder: 'INBOX', count: 7 })).toContain('INBOX');
  });
});

describe('wrapLoggerWithScrub', () => {
  it('scrubs args before passing to the wrapped logger', () => {
    const captured: { level: string; args: unknown[] }[] = [];
    const fake = {
      info: (...args: unknown[]) => captured.push({ level: 'info', args }),
      warn: (...args: unknown[]) => captured.push({ level: 'warn', args }),
      error: (...args: unknown[]) => captured.push({ level: 'error', args }),
    };
    const wrapped = wrapLoggerWithScrub(fake);
    wrapped.info('Authorization: Bearer sk-leaky-token-abcdef');
    wrapped.warn({ apiKey: 'AIzaSy12345678901234567890ABC' });
    expect(captured[0]?.args[0]).toContain('Bearer ***');
    expect(captured[1]?.args[0]).not.toContain('AIzaSy12345678');
  });
});
