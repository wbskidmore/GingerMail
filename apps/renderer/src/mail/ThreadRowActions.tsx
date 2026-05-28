import { useState } from 'react';
import { ActionIcon, Group, Menu, Text, Tooltip } from '@mantine/core';
import { IconArchive, IconClock, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-react';
import type { MessageHeader, MessageThread } from '@gingermail/core';
import { MAIL_ACTION_BY_ID, type MailActionContext } from './actions.js';
import type { Api } from '../ipcBridge.js';

interface QuickActionsProps {
  thread: MessageThread;
  /** Resolves the thread's most recent message header so the registry has
   *  something to act on without us round-tripping through `mail.getMessage`. */
  resolveHeader: () => Promise<MessageHeader | null>;
  api: Api;
  ui: MailActionContext['ui'];
  visible: boolean;
}

/**
 * Compact "Archive / Trash / Flag / Snooze" hover strip rendered on the
 * right edge of each ThreadRow. Fixed set of actions in v1 (not yet
 * configurable via Settings) so muscle memory matches Apple Mail.
 */
export function ThreadRowQuickActions({ thread, resolveHeader, api, ui, visible }: QuickActionsProps) {
  // Hidden but present so screen readers still see the actions; visual
  // toggle uses opacity so the buttons reserve their layout slot.
  return (
    <Group
      gap={2}
      wrap="nowrap"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 80ms ease-out', pointerEvents: visible ? 'auto' : 'none' }}
      onClick={(e) => e.stopPropagation()}
    >
      <QuickAction
        label="Archive"
        icon={<IconArchive size={14} />}
        run={async () => {
          const h = await resolveHeader();
          if (!h) return;
          try {
            const r = await api.mail.archive({ id: h.id });
            ui.notify('Archived', thread.subject || '(no subject)', {
              undo: r.previousFolderId
                ? () => api.mail.move({ id: r.newId, folderId: r.previousFolderId }).then(() => undefined)
                : undefined,
            });
            ui.reloadAfterMove();
          } catch (e) {
            ui.notify('Archive failed', (e as Error).message, { color: 'red' });
          }
        }}
      />
      <QuickAction
        label="Trash"
        icon={<IconTrash size={14} />}
        destructive
        run={async () => {
          const h = await resolveHeader();
          if (!h) return;
          const ok = await ui.confirmDestructive({
            title: 'Move to trash?',
            body: 'This message will be moved to the trash on the server.',
            confirmLabel: 'Move to trash',
          });
          if (!ok) return;
          try {
            const r = await api.mail.trash({ id: h.id });
            ui.notify('Moved to trash', thread.subject || '(no subject)', {
              undo: r.previousFolderId
                ? () => api.mail.move({ id: r.newId, folderId: r.previousFolderId }).then(() => undefined)
                : undefined,
            });
            ui.reloadAfterMove();
          } catch (e) {
            ui.notify('Trash failed', (e as Error).message, { color: 'red' });
          }
        }}
      />
      <QuickAction
        label={thread.flagged ? 'Unflag' : 'Flag'}
        icon={thread.flagged ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        run={async () => {
          const h = await resolveHeader();
          if (!h) return;
          await api.mail.setFlag({ id: h.id, flag: thread.flagged ? 'unstar' : 'star' });
          ui.notify(thread.flagged ? 'Unflagged' : 'Flagged', thread.subject || '(no subject)');
        }}
      />
      <QuickAction
        label="Snooze 1h"
        icon={<IconClock size={14} />}
        run={async () => {
          const h = await resolveHeader();
          if (!h) return;
          const until = Date.now() + 60 * 60 * 1000;
          await api.mail.snooze({ id: h.id, until });
          ui.notify('Snoozed for 1h', thread.subject || '(no subject)');
        }}
      />
    </Group>
  );
}

function QuickAction({
  label,
  icon,
  destructive,
  run,
}: {
  label: string;
  icon: React.ReactNode;
  destructive?: boolean;
  run: () => void | Promise<void>;
}) {
  return (
    <Tooltip label={label} openDelay={400}>
      <ActionIcon
        size="sm"
        variant="subtle"
        color={destructive ? 'red' : 'gray'}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          void run();
        }}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  );
}

interface ContextMenuProps {
  children: React.ReactNode;
  resolveHeader: () => Promise<MessageHeader | null>;
  loadFullMessage: (id: string) => Promise<MailActionContext['message']>;
  api: Api;
  ui: MailActionContext['ui'];
}

/**
 * Right-click context menu wrapper for thread rows. Renders the FULL action
 * registry (no Visible/Overflow split) so users can reach Move, Spam, Print
 * etc. without leaving the keyboard or hunting through the toolbar.
 */
export function ThreadRowContextMenu({ children, resolveHeader, loadFullMessage, api, ui }: ContextMenuProps) {
  const [opened, setOpened] = useState(false);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);

  const open = async (clientX: number, clientY: number) => {
    setX(clientX);
    setY(clientY);
    setOpened(true);
  };

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        void open(e.clientX, e.clientY);
      }}
    >
      {children}
      <Menu
        opened={opened}
        onClose={() => setOpened(false)}
        position="bottom-start"
        shadow="md"
        // Anchor the floating menu to the right-click location.
        styles={{ dropdown: { position: 'fixed', top: y, left: x } }}
      >
        <Menu.Dropdown>
          {Object.values(MAIL_ACTION_BY_ID).map((a) => (
            <Menu.Item
              key={a.id}
              leftSection={a.icon}
              color={a.destructive ? 'red' : undefined}
              rightSection={a.hotkey ? <Text size="xs" c="dimmed">{a.hotkey}</Text> : null}
              onClick={async () => {
                setOpened(false);
                const h = await resolveHeader();
                if (!h) return;
                try {
                  const full = await loadFullMessage(h.id);
                  await a.run({ message: full, api, ui });
                } catch (e) {
                  ui.notify('Action failed', (e as Error).message, { color: 'red' });
                }
              }}
            >
              {a.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
