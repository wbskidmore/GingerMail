import { describe, it, expect } from 'vitest';
import { parseListUnsubscribe } from '../src/unsubscribe.js';

describe('parseListUnsubscribe', () => {
  it('returns empty result when header is missing', () => {
    expect(parseListUnsubscribe(undefined)).toEqual({ oneClick: false });
  });

  it('extracts mailto + https targets', () => {
    const r = parseListUnsubscribe(
      '<mailto:unsubscribe@example.com>, <https://example.com/u/abc>',
      'List-Unsubscribe=One-Click',
    );
    expect(r.mailto).toBe('mailto:unsubscribe@example.com');
    expect(r.http).toBe('https://example.com/u/abc');
    expect(r.oneClick).toBe(true);
  });

  it('tolerates missing angle brackets and extra whitespace', () => {
    const r = parseListUnsubscribe('  mailto:foo@bar.com ,   https://bar.com/u  ');
    expect(r.mailto).toBe('mailto:foo@bar.com');
    expect(r.http).toBe('https://bar.com/u');
    expect(r.oneClick).toBe(false);
  });

  it('rejects insecure http:// targets but accepts mailto', () => {
    const r = parseListUnsubscribe('<http://example.com/u>, <mailto:foo@bar.com>');
    expect(r.http).toBeUndefined();
    expect(r.mailto).toBe('mailto:foo@bar.com');
  });

  it('treats one-click marker as case-insensitive', () => {
    expect(parseListUnsubscribe('<https://x.io/u>', 'list-unsubscribe=one-click').oneClick).toBe(true);
  });

  it('keeps only the first token of each scheme', () => {
    const r = parseListUnsubscribe('<mailto:a@x.com>, <mailto:b@x.com>, <https://x.com/u>, <https://y.com/u>');
    expect(r.mailto).toBe('mailto:a@x.com');
    expect(r.http).toBe('https://x.com/u');
  });
});
