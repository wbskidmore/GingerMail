import { useEffect } from 'react';
import { AppShell, MantineProvider, Tabs } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import {
  IconCalendar,
  IconChecklist,
  IconInbox,
  IconSettings,
} from '@tabler/icons-react';
import { FocusOverlay, gingermailTheme } from '@gingermail/ui-kit';
import { useAppStore, type TabId } from './store.js';
import { MailTab } from './tabs/MailTab.js';
import { CalendarTab } from './tabs/CalendarTab.js';
import { TasksTab } from './tabs/TasksTab.js';
import { SettingsTab } from './tabs/SettingsTab.js';
import { TitleBar } from './shell/TitleBar.js';
import { ActionBar } from './shell/ActionBar.js';

// Three header rows: TitleBar (48) + ActionBar (40) + Tabs (~44). Keep this
// in sync with AppShell.Header `height` + AppShell.Main `calc(100vh - …)`.
const HEADER_HEIGHT = 132;

export function App() {
  const init = useAppStore((s) => s.init);
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const focus = useAppStore((s) => s.focus);
  const stopFocus = useAppStore((s) => s.stopFocus);
  const themeMode = useAppStore((s) => s.themeMode);
  const userMode = useAppStore((s) => s.settings.appearance.themeMode);
  const colorScheme: 'light' | 'dark' = userMode === 'system' ? themeMode : userMode;

  useEffect(() => {
    void init();
    const handler = (evt: KeyboardEvent) => {
      const meta = evt.metaKey || evt.ctrlKey;
      if (meta && evt.shiftKey && evt.key.toLowerCase() === 'f') {
        evt.preventDefault();
        const store = useAppStore.getState();
        if (store.focus.active) void store.stopFocus();
        else void store.startFocus(store.settings.focus.defaultDurationMin);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [init]);

  return (
    <MantineProvider theme={gingermailTheme} defaultColorScheme="auto" forceColorScheme={colorScheme}>
      <Notifications position="bottom-right" zIndex={2000} limit={5} />
      <ModalsProvider>
        {/* Skip-to-content link: first focusable element in the tree so
            keyboard / screen reader users can bypass the multi-row header
            in one keystroke. See packages/ui-kit/src/theme.css for the
            visible-on-focus styling. */}
        <a href="#gm-main" className="gm-skip-link">Skip to main content</a>
        <AppShell header={{ height: HEADER_HEIGHT }} padding={0} layout="alt">
          <AppShell.Header withBorder role="banner">
            <TitleBar />
            <ActionBar />
            <nav aria-label="Primary">
              <Tabs
                value={tab}
                onChange={(v) => v && setTab(v as TabId)}
                variant="default"
                radius="md"
                keepMounted={false}
                styles={{ list: { paddingInline: 12, borderBottom: 'none' } }}
              >
                <Tabs.List role="tablist" aria-label="Sections">
                  <Tabs.Tab value="mail" leftSection={<IconInbox size={16} aria-hidden />}>Mail</Tabs.Tab>
                  <Tabs.Tab value="calendar" leftSection={<IconCalendar size={16} aria-hidden />}>Calendar</Tabs.Tab>
                  <Tabs.Tab value="tasks" leftSection={<IconChecklist size={16} aria-hidden />}>Tasks</Tabs.Tab>
                  <Tabs.Tab value="settings" leftSection={<IconSettings size={16} aria-hidden />}>Settings</Tabs.Tab>
                </Tabs.List>
              </Tabs>
            </nav>
          </AppShell.Header>

          <AppShell.Main
            id="gm-main"
            role="main"
            aria-label={`${tab.charAt(0).toUpperCase()}${tab.slice(1)} content`}
            style={{ height: `calc(100vh - ${HEADER_HEIGHT}px)`, overflow: 'hidden' }}
          >
            {tab === 'mail' && <MailTab />}
            {tab === 'calendar' && <CalendarTab />}
            {tab === 'tasks' && <TasksTab />}
            {tab === 'settings' && <SettingsTab />}
          </AppShell.Main>
        </AppShell>
        <FocusOverlay state={focus} onStop={() => void stopFocus()} />
      </ModalsProvider>
    </MantineProvider>
  );
}
