import { Group } from '@mantine/core';
import { NavSearch } from './NavSearch.js';

/**
 * The ActionBar is a thin, non-draggable row that sits between the title bar
 * and the Tabs nav. Today it just hosts the global search input on the right;
 * future quick-actions (compose-everywhere, recent peeks, etc.) can land here.
 *
 * Keeping it as its own component means future contents can change without
 * touching App.tsx's AppShell.Header math.
 */
export function ActionBar() {
  return (
    <div className="gm-actionbar-region">
      <Group justify="flex-end" align="center" h="100%" px="md" gap="sm">
        <NavSearch />
      </Group>
    </div>
  );
}
