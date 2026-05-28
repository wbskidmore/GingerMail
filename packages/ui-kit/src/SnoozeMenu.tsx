import { Menu, Text, Group } from '@mantine/core';
import { IconClock, IconCalendarTime } from '@tabler/icons-react';
import { SNOOZE_PRESETS } from '@gingermail/core';
import type { ReactNode } from 'react';

export interface SnoozeMenuProps {
  /** The trigger element that opens the menu (e.g. an ActionIcon). */
  target: ReactNode;
  onSelect: (presetId: string, fireAt: number) => void;
  onCustom?: () => void;
  /** Optional label shown above the preset list. */
  title?: string;
}

/**
 * Mantine `Menu` wrapped around our snooze presets.
 *
 * Every option is rendered as a `Menu.Item` so the WAI-ARIA `menu` role
 * is intact end-to-end:
 *   - up/down arrow keys move focus between items
 *   - enter activates the focused item
 *   - escape dismisses without selecting
 *   - screen readers announce "menu item" on focus and "menu" on open
 *
 * The previous version used `UnstyledButton` rows nested inside `Stack`,
 * which broke Mantine's roving-tabindex implementation — the items were
 * reachable only with mouse / tab, not arrow keys. That's the WCAG 2.1
 * keyboard-trap regression the accessibility review flagged.
 */
export function SnoozeMenu({ target, onSelect, onCustom, title = 'Snooze until' }: SnoozeMenuProps) {
  const now = new Date();
  return (
    <Menu width={300} withArrow shadow="md" trapFocus closeOnEscape>
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown aria-label={title}>
        <Menu.Label>
          <Group gap={6}>
            <IconClock size={14} aria-hidden />
            <span>{title}</span>
          </Group>
        </Menu.Label>
        {SNOOZE_PRESETS.map((p) => {
          const at = p.compute(now);
          const stamp = at.toLocaleString(undefined, {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <Menu.Item
              key={p.id}
              onClick={() => onSelect(p.id, at.getTime())}
              aria-label={`${p.label} (${stamp})`}
              rightSection={<Text size="xs" c="dimmed">{stamp}</Text>}
            >
              {p.label}
            </Menu.Item>
          );
        })}
        {onCustom && (
          <>
            <Menu.Divider />
            <Menu.Item leftSection={<IconCalendarTime size={14} aria-hidden />} onClick={onCustom}>
              Pick custom time&hellip;
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
