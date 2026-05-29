import { Group, Kbd, Stack, Text, Title } from '@mantine/core';
import { useAppStore } from '../store.js';
import { SHORTCUTS, SHORTCUT_GROUPS, formatHotkey } from '../shortcuts.js';

/**
 * Renders the keyboard-shortcut map grouped by section. Shared by the global
 * cheat-sheet modal and the Settings → Help section so there is exactly one
 * place that lists shortcuts, fed by the single `SHORTCUTS` registry.
 */
export function ShortcutsCheatSheet() {
  const platform = useAppStore((s) => s.platform);
  return (
    <Stack gap="lg">
      {SHORTCUT_GROUPS.map((group) => {
        const items = SHORTCUTS.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <Stack key={group} gap={6}>
            <Title order={6} c="dimmed" tt="uppercase" fz="xs">
              {group}
            </Title>
            {items.map((s) => (
              <Group key={s.id} justify="space-between" wrap="nowrap">
                <Text size="sm">{s.label}</Text>
                <Kbd>{formatHotkey(s.hotkey, platform)}</Kbd>
              </Group>
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}
