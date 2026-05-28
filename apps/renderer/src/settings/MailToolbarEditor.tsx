import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconEye,
  IconEyeOff,
  IconRefresh,
  IconDots,
} from '@tabler/icons-react';
import type { MailActionId, MailToolbarSettings } from '@gingermail/core';
import { DEFAULT_MAIL_TOOLBAR } from '@gingermail/core';
import { MAIL_ACTION_BY_ID, partitionActions } from '../mail/actions.js';

interface MailToolbarEditorProps {
  value: MailToolbarSettings;
  onChange: (next: MailToolbarSettings) => void;
}

/**
 * Three-column editor for the user-customisable Mail toolbar. Each column
 * is a stack of action chips with move-up / move-down / move-to-another-
 * column buttons. Deliberately keyboard-driven instead of relying on a
 * drag-and-drop library so no extra dep is needed.
 *
 *   - Toolbar    : rendered as inline ActionIcons in the MessagePane.
 *   - More menu  : packed under the `\u22ee` overflow menu.
 *   - Hidden     : never rendered in the toolbar (still keyboard / context-menu).
 */
export function MailToolbarEditor({ value, onChange }: MailToolbarEditorProps) {
  const { visible, overflow, hidden } = partitionActions(value);

  function move(id: MailActionId, to: 'visible' | 'overflow' | 'hidden'): void {
    const next: MailToolbarSettings = {
      visible: value.visible.filter((x) => x !== id),
      overflow: value.overflow.filter((x) => x !== id),
    };
    if (to === 'visible') next.visible.push(id);
    if (to === 'overflow') next.overflow.push(id);
    onChange(next);
  }

  function reorder(list: 'visible' | 'overflow', id: MailActionId, dir: -1 | 1): void {
    const source = list === 'visible' ? [...value.visible] : [...value.overflow];
    const idx = source.indexOf(id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= source.length) return;
    [source[idx], source[swap]] = [source[swap]!, source[idx]!];
    onChange(list === 'visible' ? { ...value, visible: source } : { ...value, overflow: source });
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Box>
          <Title order={5}>Mail toolbar</Title>
          <Text size="xs" c="dimmed">
            Reorder or hide the action icons that appear above an open message.
            Keyboard shortcuts keep working even for hidden actions.
          </Text>
        </Box>
        <Tooltip label="Restore defaults">
          <ActionIcon variant="subtle" onClick={() => onChange(DEFAULT_MAIL_TOOLBAR)} aria-label="Restore defaults">
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Group align="stretch" gap="sm" grow wrap="nowrap">
        <Column
          title="Toolbar"
          subtitle="Inline icons above the message"
          icon={<IconEye size={14} />}
          items={visible}
          onMoveUp={(id) => reorder('visible', id, -1)}
          onMoveDown={(id) => reorder('visible', id, 1)}
          actions={(id) => (
            <>
              <Tooltip label="Move to More menu">
                <ActionIcon size="sm" variant="subtle" onClick={() => move(id, 'overflow')} aria-label="Move to More menu">
                  <IconDots size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hide">
                <ActionIcon size="sm" variant="subtle" onClick={() => move(id, 'hidden')} aria-label="Hide">
                  <IconEyeOff size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        />
        <Column
          title="More menu"
          subtitle="Packed under the More button"
          icon={<IconDots size={14} />}
          items={overflow}
          onMoveUp={(id) => reorder('overflow', id, -1)}
          onMoveDown={(id) => reorder('overflow', id, 1)}
          actions={(id) => (
            <>
              <Tooltip label="Promote to toolbar">
                <ActionIcon size="sm" variant="subtle" onClick={() => move(id, 'visible')} aria-label="Promote to toolbar">
                  <IconEye size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Hide">
                <ActionIcon size="sm" variant="subtle" onClick={() => move(id, 'hidden')} aria-label="Hide">
                  <IconEyeOff size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        />
        <Column
          title="Hidden"
          subtitle="Reachable only via shortcut / right-click"
          icon={<IconEyeOff size={14} />}
          items={hidden}
          actions={(id) => (
            <>
              <Tooltip label="Add to toolbar">
                <ActionIcon size="sm" variant="subtle" onClick={() => move(id, 'visible')} aria-label="Add to toolbar">
                  <IconEye size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Add to More menu">
                <ActionIcon size="sm" variant="subtle" onClick={() => move(id, 'overflow')} aria-label="Add to More menu">
                  <IconDots size={14} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        />
      </Group>
      <Group justify="flex-end">
        <Button size="xs" variant="subtle" onClick={() => onChange(DEFAULT_MAIL_TOOLBAR)}>
          Restore defaults
        </Button>
      </Group>
    </Stack>
  );
}

function Column({
  title,
  subtitle,
  icon,
  items,
  onMoveUp,
  onMoveDown,
  actions,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: MailActionId[];
  onMoveUp?: (id: MailActionId) => void;
  onMoveDown?: (id: MailActionId) => void;
  actions: (id: MailActionId) => React.ReactNode;
}) {
  return (
    <Card withBorder radius="md" p="sm" miw={220}>
      <Stack gap={4} mb="xs">
        <Group gap={6}>
          {icon}
          <Text size="sm" fw={600}>{title}</Text>
        </Group>
        <Text size="xs" c="dimmed">{subtitle}</Text>
      </Stack>
      <Stack gap={4}>
        {items.length === 0 && <Text size="xs" c="dimmed">Empty</Text>}
        {items.map((id, i) => {
          const a = MAIL_ACTION_BY_ID[id];
          if (!a) return null;
          return (
            <Group key={id} gap={4} wrap="nowrap" justify="space-between"
              style={{ padding: '4px 6px', borderRadius: 6, background: 'var(--mantine-color-default-hover)' }}
            >
              <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                {a.icon}
                <Text size="sm" truncate>{a.label}</Text>
                {a.hotkey && <Text size="xs" c="dimmed">{a.hotkey}</Text>}
              </Group>
              <Group gap={2} wrap="nowrap">
                {onMoveUp && (
                  <Tooltip label="Up">
                    <ActionIcon size="sm" variant="subtle" disabled={i === 0} onClick={() => onMoveUp(id)} aria-label="Move up">
                      <IconArrowUp size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
                {onMoveDown && (
                  <Tooltip label="Down">
                    <ActionIcon size="sm" variant="subtle" disabled={i === items.length - 1} onClick={() => onMoveDown(id)} aria-label="Move down">
                      <IconArrowDown size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
                {actions(id)}
              </Group>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}
