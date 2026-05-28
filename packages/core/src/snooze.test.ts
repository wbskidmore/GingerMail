import { describe, expect, it } from 'vitest';
import { SNOOZE_PRESETS, applySnoozePreset } from './snooze.js';

describe('snooze presets', () => {
  const now = new Date('2026-05-27T10:00:00');

  it('exposes the expected preset ids', () => {
    expect(SNOOZE_PRESETS.map((p) => p.id)).toEqual([
      '1h',
      'this-evening',
      'tomorrow',
      'next-weekday',
      'next-week',
    ]);
  });

  it('"1h" advances by an hour', () => {
    const at = applySnoozePreset('1h', now);
    expect(at).toBe(new Date('2026-05-27T11:00:00').getTime());
  });

  it('"this-evening" rolls to 6pm if not yet 6pm', () => {
    const at = applySnoozePreset('this-evening', now);
    expect(new Date(at!).getHours()).toBe(18);
    expect(new Date(at!).getDate()).toBe(27);
  });

  it('"tomorrow" lands at 9am the next day', () => {
    const at = applySnoozePreset('tomorrow', now);
    const d = new Date(at!);
    expect(d.getDate()).toBe(28);
    expect(d.getHours()).toBe(9);
  });

  it('"next-week" lands on a Monday', () => {
    const at = applySnoozePreset('next-week', now);
    const d = new Date(at!);
    expect(d.getDay()).toBe(1);
  });

  it('returns null for unknown presets', () => {
    expect(applySnoozePreset('does-not-exist', now)).toBeNull();
  });
});
