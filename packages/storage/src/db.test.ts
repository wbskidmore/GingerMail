import { describe, expect, it } from 'vitest';
import { safeFtsQuery } from './db.js';

describe('safeFtsQuery', () => {
  it('quotes single token', () => {
    expect(safeFtsQuery('budget')).toBe('"budget"');
  });

  it('AND-joins multiple tokens', () => {
    expect(safeFtsQuery('q3 budget')).toBe('"q3" AND "budget"');
  });

  it('collapses extra whitespace', () => {
    expect(safeFtsQuery('   hello    world  ')).toBe('"hello" AND "world"');
  });

  it('escapes embedded double quotes by doubling', () => {
    expect(safeFtsQuery('say "hi"')).toBe('"say" AND """hi"""');
  });

  it('returns an empty literal phrase for empty input', () => {
    expect(safeFtsQuery('')).toBe('""');
    expect(safeFtsQuery('   ')).toBe('""');
  });

  it('does not interpret FTS5 operators in the token stream', () => {
    // A naive implementation would let `OR` and `NOT` through unquoted; ours
    // wraps every token so they become literal search terms.
    expect(safeFtsQuery('foo OR bar')).toBe('"foo" AND "OR" AND "bar"');
  });
});
