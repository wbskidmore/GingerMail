import { describe, expect, it } from 'vitest';
import { createFocusState, focusRemainingMs, isFocusExpired } from './focus.js';

describe('focus mode state', () => {
  it('creates an active state with end and break reminder', () => {
    const now = new Date('2026-05-27T10:00:00');
    const state = createFocusState(25, 45, now);
    expect(state.active).toBe(true);
    expect(state.endsAt).toBe(now.getTime() + 25 * 60_000);
    expect(state.breakReminderAt).toBe(now.getTime() + 45 * 60_000);
  });

  it('omits break reminder when not requested', () => {
    const state = createFocusState(25);
    expect(state.breakReminderAt).toBeUndefined();
  });

  it('reports remaining time and expiration', () => {
    const now = new Date('2026-05-27T10:00:00');
    const state = createFocusState(10, undefined, now);
    expect(focusRemainingMs(state, now)).toBe(10 * 60_000);
    expect(focusRemainingMs(state, new Date('2026-05-27T10:09:00'))).toBe(60_000);
    expect(isFocusExpired(state, new Date('2026-05-27T10:11:00'))).toBe(true);
  });

  it('treats inactive state as not expired and zero remaining', () => {
    const state = { active: false };
    expect(focusRemainingMs(state)).toBe(0);
    expect(isFocusExpired(state)).toBe(false);
  });
});
