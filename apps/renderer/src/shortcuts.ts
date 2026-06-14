import type { Platform } from './ipcBridge.js';
import type { TabId } from './store.js';

export type ShortcutGroup = 'Navigation' | 'Global' | 'Slack';

/**
 * Single source of truth for every keyboard shortcut in GingerMail. The
 * global hotkey handler (App.tsx) and the Help cheat-sheet (SettingsTab +
 * ShortcutsModal) both render from this list so a shortcut can never drift
 * between "what fires" and "what the docs say".
 *
 * `hotkey` is in Mantine `useHotkeys` syntax ("mod+1", "mod+shift+F"); the
 * `mod` token maps to Cmd on macOS and Ctrl elsewhere.
 */
export interface ShortcutDef {
  id: string;
  hotkey: string;
  label: string;
  group: ShortcutGroup;
  /** When set, this shortcut switches to the given top-level tab. */
  tab?: TabId;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'tab-mail', hotkey: 'mod+1', label: 'Go to Mail', group: 'Navigation', tab: 'mail' },
  {
    id: 'tab-calendar',
    hotkey: 'mod+2',
    label: 'Go to Calendar',
    group: 'Navigation',
    tab: 'calendar',
  },
  { id: 'tab-tasks', hotkey: 'mod+3', label: 'Go to Tasks', group: 'Navigation', tab: 'tasks' },
  { id: 'tab-slack', hotkey: 'mod+4', label: 'Go to Slack', group: 'Navigation', tab: 'slack' },
  {
    id: 'tab-settings',
    hotkey: 'mod+5',
    label: 'Go to Settings',
    group: 'Navigation',
    tab: 'settings',
  },
  { id: 'refresh', hotkey: 'mod+R', label: 'Refresh / re-sync everything', group: 'Global' },
  { id: 'focus', hotkey: 'mod+shift+F', label: 'Toggle Focus Mode', group: 'Global' },
  { id: 'help', hotkey: 'shift+?', label: 'Show keyboard shortcuts', group: 'Global' },
  { id: 'slack-next', hotkey: 'alt+ArrowDown', label: 'Next conversation', group: 'Slack' },
  { id: 'slack-prev', hotkey: 'alt+ArrowUp', label: 'Previous conversation', group: 'Slack' },
];

/** Ordered groups for rendering the cheat sheet. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Navigation', 'Global', 'Slack'];

const KEY_LABELS_MAC: Record<string, string> = {
  mod: '\u2318', // ⌘
  shift: '\u21e7', // ⇧
  alt: '\u2325', // ⌥
  ctrl: '\u2303', // ⌃
  ArrowUp: '\u2191',
  ArrowDown: '\u2193',
};

const KEY_LABELS_OTHER: Record<string, string> = {
  mod: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  ctrl: 'Ctrl',
  ArrowUp: '\u2191',
  ArrowDown: '\u2193',
};

/**
 * Turn a Mantine hotkey string into a human-readable, platform-aware label,
 * e.g. "mod+shift+F" -> "⌘⇧F" (mac) or "Ctrl+Shift+F" (Windows/Linux).
 */
export function formatHotkey(hotkey: string, platform: Platform): string {
  const isMac = platform === 'darwin';
  const labels = isMac ? KEY_LABELS_MAC : KEY_LABELS_OTHER;
  const sep = isMac ? '' : '+';
  return hotkey
    .split('+')
    .map((part) => {
      const mapped = labels[part];
      if (mapped) return mapped;
      // Single letters: upper-case; everything else passes through.
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(sep);
}
