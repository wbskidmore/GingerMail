import { Modal } from '@mantine/core';
import { ShortcutsCheatSheet } from './ShortcutsCheatSheet.js';

/**
 * Global keyboard-shortcut cheat sheet, toggled with "?" from anywhere in the
 * app. Content comes from the shared `ShortcutsCheatSheet` so it always
 * matches the Settings → Help listing.
 */
export function ShortcutsModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="md" centered>
      <ShortcutsCheatSheet />
    </Modal>
  );
}
