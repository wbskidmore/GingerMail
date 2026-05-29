import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { IconKeyboard } from '@tabler/icons-react';
import { NavSearch } from './NavSearch.js';
import { useAppStore } from '../store.js';

/**
 * The ActionBar is a thin, non-draggable row that sits between the title bar
 * and the Tabs nav. It hosts the global search input plus a keyboard-shortcut
 * help button on the right; future quick-actions can land here too.
 *
 * Keeping it as its own component means future contents can change without
 * touching App.tsx's AppShell.Header math.
 */
export function ActionBar() {
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  return (
    <div className="gm-actionbar-region">
      <Group justify="flex-end" align="center" h="100%" px="md" gap="sm">
        <NavSearch />
        <Tooltip label="Keyboard shortcuts (?)">
          <ActionIcon
            data-no-drag
            variant="subtle"
            color="gray"
            aria-label="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            <IconKeyboard size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </div>
  );
}
