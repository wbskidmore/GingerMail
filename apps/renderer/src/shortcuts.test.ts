import { describe, expect, it } from 'vitest';
import { SHORTCUTS, formatHotkey } from './shortcuts.js';

describe('shortcuts registry', () => {
  it('maps a distinct number key to each top-level tab', () => {
    const tabShortcuts = SHORTCUTS.filter((s) => s.tab);
    const digits = tabShortcuts.map((s) => s.hotkey.split('+').pop());
    // No two tabs share a digit.
    expect(new Set(digits).size).toBe(digits.length);
    // The five tabs are all covered.
    expect(tabShortcuts.map((s) => s.tab).sort()).toEqual([
      'calendar',
      'mail',
      'settings',
      'slack',
      'tasks',
    ]);
  });

  it('has unique ids and hotkeys', () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    expect(new Set(SHORTCUTS.map((s) => s.hotkey)).size).toBe(SHORTCUTS.length);
  });
});

describe('formatHotkey', () => {
  it('renders macOS glyphs without separators', () => {
    expect(formatHotkey('mod+shift+F', 'darwin')).toBe('\u2318\u21e7F');
    expect(formatHotkey('mod+1', 'darwin')).toBe('\u23181');
  });

  it('renders Windows/Linux with named keys and + separators', () => {
    expect(formatHotkey('mod+shift+F', 'win32')).toBe('Ctrl+Shift+F');
    expect(formatHotkey('mod+1', 'win32')).toBe('Ctrl+1');
  });

  it('maps arrow keys to glyphs', () => {
    expect(formatHotkey('alt+ArrowDown', 'darwin')).toBe('\u2325\u2193');
  });
});
