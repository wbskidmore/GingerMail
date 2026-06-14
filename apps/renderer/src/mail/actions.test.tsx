// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ALL_ACTION_IDS, MAIL_ACTION_BY_ID, partitionActions } from './actions.js';
import { DEFAULT_MAIL_TOOLBAR } from '@gingermail/core';

describe('Mail action registry', () => {
  it('exposes every catalogued id in MAIL_ACTION_BY_ID', () => {
    for (const id of ALL_ACTION_IDS) {
      expect(MAIL_ACTION_BY_ID[id]).toBeDefined();
      expect(MAIL_ACTION_BY_ID[id].id).toBe(id);
    }
  });

  it('every catalogued action has a label and an icon', () => {
    for (const id of ALL_ACTION_IDS) {
      const a = MAIL_ACTION_BY_ID[id];
      expect(typeof a.label).toBe('string');
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.icon).toBeTruthy();
    }
  });

  it('default toolbar references only known ids', () => {
    for (const id of [...DEFAULT_MAIL_TOOLBAR.visible, ...DEFAULT_MAIL_TOOLBAR.overflow]) {
      expect(MAIL_ACTION_BY_ID[id]).toBeDefined();
    }
  });

  it('default toolbar partitions into visible + overflow + a non-empty hidden once we add new actions', () => {
    const part = partitionActions(DEFAULT_MAIL_TOOLBAR);
    expect(part.visible).toEqual(DEFAULT_MAIL_TOOLBAR.visible);
    expect(part.overflow).toEqual(DEFAULT_MAIL_TOOLBAR.overflow);
    // Right now the default toolbar covers every catalogued action, so
    // hidden should be empty. Keeping the assertion explicit catches the
    // moment someone adds a new action without bumping defaults.
    expect(part.hidden.length).toBe(
      ALL_ACTION_IDS.length -
        DEFAULT_MAIL_TOOLBAR.visible.length -
        DEFAULT_MAIL_TOOLBAR.overflow.length,
    );
  });

  it('partition drops unknown ids defensively so a stale settings blob never crashes', () => {
    const part = partitionActions({
      visible: ['reply', 'not-a-real-action' as unknown as never],
      overflow: ['trash'],
    });
    expect(part.visible).toEqual(['reply']);
    expect(part.overflow).toEqual(['trash']);
  });
});

describe('Reply All availability', () => {
  it('hides Reply All when there is exactly one recipient', () => {
    const ra = MAIL_ACTION_BY_ID['replyAll'];
    expect(ra.isAvailable).toBeDefined();
    const ctx = {
      message: { to: [{ email: 'a@x.com' }], cc: [] },
    } as Parameters<NonNullable<typeof ra.isAvailable>>[0];
    expect(ra.isAvailable!(ctx)).toBe(false);
  });

  it('shows Reply All when there are 2+ recipients', () => {
    const ra = MAIL_ACTION_BY_ID['replyAll'];
    const ctx = {
      message: { to: [{ email: 'a@x.com' }, { email: 'b@y.com' }], cc: [] },
    } as Parameters<NonNullable<typeof ra.isAvailable>>[0];
    expect(ra.isAvailable!(ctx)).toBe(true);
  });
});
