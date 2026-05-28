import { useEffect, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Kbd, Text, Tooltip } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconFocus2, IconRefresh } from '@tabler/icons-react';
import { useAppStore } from '../store.js';
import { getApi } from '../ipcBridge.js';

/**
 * Slim title bar: app icon + name + version (centered, draggable) and
 * Refresh + Focus buttons on the right (non-draggable). The global search
 * input now lives one row below in the ActionBar.
 *
 * Padding insets account for OS chrome:
 *   - macOS traffic lights sit top-left, so we pad-left 78px.
 *   - Windows / Linux caption buttons sit top-right, so we pad-right 140px.
 * Both rules live in packages/ui-kit/src/theme.css.
 */
export function TitleBar() {
  const platform = useAppStore((s) => s.platform);
  const focus = useAppStore((s) => s.focus);
  const startFocus = useAppStore((s) => s.startFocus);
  const stopFocus = useAppStore((s) => s.stopFocus);
  const settings = useAppStore((s) => s.settings);
  const [version, setVersion] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getApi().app.getVersion().then(setVersion);
  }, []);

  useHotkeys([
    ['mod+shift+F', () => focus.active ? void stopFocus() : void startFocus(settings.focus.defaultDurationMin)],
    ['mod+R', async () => {
      setBusy(true);
      try { await getApi().mail.refreshAll(); } finally { setBusy(false); }
    }],
  ]);

  return (
    <div
      className="gm-titlebar-region"
      data-platform={platform}
      style={{
        height: 48,
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        columnGap: 'var(--mantine-spacing-md)',
        paddingInline: 'var(--mantine-spacing-md)',
      }}
    >
      {/* Left cell intentionally empty: keeps the centred cluster perfectly
          centred regardless of the right-cell button count. */}
      <div />

      <Group gap="xs" wrap="nowrap" style={{ justifySelf: 'center' }}>
        <img
          src="./icon.png"
          alt=""
          width={22}
          height={22}
          style={{ borderRadius: 5, display: 'block' }}
          draggable={false}
        />
        <Text fw={700}>GingerMail</Text>
        {version && (
          <Badge variant="light" size="xs" color="gray">
            v{version}
          </Badge>
        )}
      </Group>

      <Group gap="xs" wrap="nowrap" style={{ justifySelf: 'end' }}>
        <Tooltip label="Refresh (Cmd/Ctrl+R)">
          <ActionIcon
            data-no-drag
            variant="subtle"
            color="gray"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await getApi().mail.refreshAll();
                notifications.show({ title: 'Inbox refreshed', message: 'All accounts re-synced.', autoClose: 1800 });
              } catch (e) {
                notifications.show({ title: 'Refresh failed', message: (e as Error).message, color: 'red' });
              } finally {
                setBusy(false);
              }
            }}
            aria-label="Refresh"
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
        {focus.active ? (
          <Button data-no-drag size="xs" variant="filled" color="ginger" leftSection={<IconFocus2 size={14} />} onClick={() => stopFocus()}>
            Focus running
          </Button>
        ) : (
          <Tooltip
            label={
              <Group gap={4}>
                <Text size="xs">Toggle focus mode</Text>
                <Kbd>{platform === 'darwin' ? '\u2318\u21e7F' : 'Ctrl+Shift+F'}</Kbd>
              </Group>
            }
          >
            <Button data-no-drag size="xs" variant="subtle" color="gray" leftSection={<IconFocus2 size={14} />} onClick={() => startFocus(settings.focus.defaultDurationMin)}>
              Focus
            </Button>
          </Tooltip>
        )}
      </Group>
    </div>
  );
}
