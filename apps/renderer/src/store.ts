import { create } from 'zustand';
import type { Account, AppSettings, FocusState } from '@gingermail/core';
import { defaultAppSettings } from '@gingermail/core';
import { getApi, type Platform } from './ipcBridge.js';

export type TabId = 'mail' | 'calendar' | 'tasks' | 'slack' | 'settings';

interface AppStore {
  tab: TabId;
  setTab: (tab: TabId) => void;
  /** Whether the global keyboard-shortcuts cheat sheet is open. */
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  accounts: Account[];
  settings: AppSettings;
  focus: FocusState;
  platform: Platform;
  accent: string;
  themeMode: 'light' | 'dark';

  refreshAccounts: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setFocus: (state: FocusState) => void;
  startFocus: (minutes: number) => Promise<void>;
  stopFocus: () => Promise<void>;
  init: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  tab: 'mail',
  setTab: (tab) => set({ tab }),
  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  accounts: [],
  settings: defaultAppSettings,
  focus: { active: false },
  platform: 'darwin',
  accent: '#6366f1',
  themeMode: 'light',

  refreshAccounts: async () => {
    const list = await getApi().accounts.list();
    set({ accounts: list });
  },
  refreshSettings: async () => {
    const settings = await getApi().settings.get();
    set({ settings });
    applySettingsToRoot(settings);
  },
  setSettings: async (patch) => {
    const next = await getApi().settings.update(patch);
    set({ settings: next });
    applySettingsToRoot(next);
  },
  setFocus: (focus) => set({ focus }),
  startFocus: async (minutes) => {
    await getApi().focus.start({ durationMin: minutes });
  },
  stopFocus: async () => {
    await getApi().focus.stop();
  },

  init: async () => {
    const api = getApi();
    const [accounts, settings, platform, accent, focus] = await Promise.all([
      api.accounts.list(),
      api.settings.get(),
      api.app.getPlatform(),
      api.app.getAccentColor(),
      api.focus.status(),
    ]);
    const themeMode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    set({ accounts, settings, platform, accent, themeMode, focus });
    applyThemeToRoot(themeMode, accent);
    applySettingsToRoot(settings);

    api.app.onThemeChanged((mode) => {
      set({ themeMode: mode });
      applyThemeToRoot(mode, get().accent);
    });
    api.focus.onChange((state) => {
      set({ focus: state as FocusState });
    });
  },
}));

function applyThemeToRoot(mode: 'light' | 'dark', accent: string): void {
  const root = document.documentElement;
  root.dataset['theme'] = mode;
  root.style.setProperty('--gm-accent', accent);
}

function applySettingsToRoot(settings: AppSettings): void {
  const root = document.documentElement;
  root.dataset['density'] = settings.appearance.density;
  root.dataset['font'] = settings.appearance.fontFamily;
  root.style.setProperty('--gm-base-size', `${settings.appearance.baseFontSize}px`);
  if (settings.appearance.themeMode !== 'system') {
    root.dataset['theme'] = settings.appearance.themeMode;
  } else {
    delete root.dataset['theme'];
  }
  if (settings.appearance.accentOverride) {
    root.style.setProperty('--gm-accent', settings.appearance.accentOverride);
  }

  // Accessibility flags. Default to OS preference when set to 'system'; an
  // explicit 'on' / 'off' overrides the OS for this app only.
  const a11y = settings.accessibility;
  if (a11y) {
    const reduce =
      a11y.reduceMotion === 'on'
        ? true
        : a11y.reduceMotion === 'off'
          ? false
          : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) root.dataset['reduceMotion'] = 'true';
    else delete root.dataset['reduceMotion'];

    const hc =
      a11y.highContrast === 'on'
        ? true
        : a11y.highContrast === 'off'
          ? false
          : window.matchMedia('(prefers-contrast: more)').matches;
    if (hc) root.dataset['highContrast'] = 'true';
    else delete root.dataset['highContrast'];
  }
}
