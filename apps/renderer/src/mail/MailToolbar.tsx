import { useCallback, useState } from 'react';
import { ActionIcon, Menu, Popover, Stack, Text, TextInput, Tooltip, Group } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconDots } from '@tabler/icons-react';
import type { Folder, MailActionId, MailToolbarSettings, Message } from '@gingermail/core';
import { DEFAULT_MAIL_TOOLBAR } from '@gingermail/core';
import {
  FLAG_ON_ICON,
  MAIL_ACTION_BY_ID,
  partitionActions,
  type MailActionContext,
} from './actions.js';

interface MailToolbarProps {
  message: Message;
  folders: Folder[];
  settings?: MailToolbarSettings;
  ctx: MailActionContext;
  /** Renderer's "Move to folder" handler; opens a popover with the folder list. */
  onMoveToFolder?: (folderId: string) => void | Promise<void>;
}

/**
 * Renders the user-customised mail action toolbar above an open message.
 * Visible actions become inline `ActionIcon`s; overflow actions are packed
 * under a single `IconDots` Menu. Move is special-cased into a Popover with
 * a type-to-filter folder list since the registry's run() for `move` can
 * only show a notification.
 *
 * Bind the registry's keyboard shortcuts here too, so they fire whenever a
 * message is in view (not only when the toolbar has focus).
 */
export function MailToolbar({
  message,
  folders,
  settings = DEFAULT_MAIL_TOOLBAR,
  ctx,
  onMoveToFolder,
}: MailToolbarProps) {
  const { visible, overflow } = partitionActions(settings);

  // Bind keyboard shortcuts for every action that has one — including the
  // ones the user has hidden from the toolbar. Users still expect E to
  // archive even if Archive isn't in their visible toolbar.
  const hotkeys: Array<[string, () => void]> = [];
  for (const a of Object.values(MAIL_ACTION_BY_ID)) {
    if (!a.hotkey) continue;
    hotkeys.push([
      a.hotkey,
      () => {
        void a.run(ctx);
      },
    ]);
  }
  useHotkeys(hotkeys);

  return (
    <Group gap={4} wrap="nowrap">
      {visible.map((id) => renderAction(id, message, ctx, folders, onMoveToFolder))}
      {overflow.length > 0 && (
        <Menu shadow="md" position="bottom-end" withArrow>
          <Menu.Target>
            <Tooltip label="More actions">
              <ActionIcon variant="subtle" aria-label="More actions">
                <IconDots size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            {overflow.map((id) => {
              const a = MAIL_ACTION_BY_ID[id];
              if (!a) return null;
              if (a.isAvailable && !a.isAvailable(ctx)) return null;
              return (
                <Menu.Item
                  key={a.id}
                  leftSection={a.icon}
                  color={a.destructive ? 'red' : undefined}
                  onClick={() => {
                    void a.run(ctx);
                  }}
                  rightSection={
                    a.hotkey ? (
                      <Text size="xs" c="dimmed">
                        {prettifyHotkey(a.hotkey)}
                      </Text>
                    ) : null
                  }
                >
                  {a.label}
                </Menu.Item>
              );
            })}
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  );
}

function renderAction(
  id: MailActionId,
  message: Message,
  ctx: MailActionContext,
  folders: Folder[],
  onMoveToFolder?: (folderId: string) => void | Promise<void>,
) {
  const a = MAIL_ACTION_BY_ID[id];
  if (!a) return null;
  if (a.isAvailable && !a.isAvailable(ctx)) return null;

  if (id === 'move') {
    return (
      <MovePopover
        key={id}
        folders={folders}
        message={message}
        onSelect={(fid) => onMoveToFolder?.(fid)}
      />
    );
  }

  // Special flag icon swap so the toolbar reflects the message's current state.
  const icon = id === 'flag' && message.flagged ? FLAG_ON_ICON : a.icon;
  const tooltip = id === 'flag' ? (message.flagged ? 'Unflag' : 'Flag') : a.label;

  return (
    <Tooltip key={id} label={tooltip}>
      <ActionIcon
        variant="subtle"
        color={a.destructive ? 'red' : id === 'flag' && message.flagged ? 'yellow' : undefined}
        aria-label={tooltip}
        onClick={() => {
          void a.run(ctx);
        }}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  );
}

function MovePopover({
  folders,
  message,
  onSelect,
}: {
  folders: Folder[];
  message: Message;
  onSelect: (folderId: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [filter, setFilter] = useState('');
  // All hooks must run unconditionally and before any early return
  // (react-hooks/rules-of-hooks), so keep this above the `a` guard below.
  const close = useCallback(() => setOpened(false), []);
  const accountFolders = folders.filter((f) => f.accountId === message.accountId);
  const filtered = accountFolders.filter(
    (f) => !filter || f.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const a = MAIL_ACTION_BY_ID['move'];
  if (!a) return null;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withArrow
      shadow="md"
      trapFocus
    >
      <Popover.Target>
        <Tooltip label={a.label}>
          <ActionIcon variant="subtle" aria-label={a.label} onClick={() => setOpened((v) => !v)}>
            {a.icon}
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="xs" miw={260}>
        <Stack gap={6}>
          <TextInput
            size="xs"
            placeholder="Filter folders\u2026"
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
          />
          <Stack gap={2} mah={240} style={{ overflowY: 'auto' }}>
            {filtered.map((f) => (
              <ActionIcon
                key={f.id}
                variant="subtle"
                component="button"
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  height: 'auto',
                  padding: '6px 8px',
                }}
                onClick={() => {
                  onSelect(f.id);
                  close();
                }}
                aria-label={`Move to ${f.name}`}
              >
                <Text size="sm" ta="left" w="100%">
                  {f.name}
                </Text>
              </ActionIcon>
            ))}
            {filtered.length === 0 && (
              <Text size="xs" c="dimmed">
                No folders match.
              </Text>
            )}
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function prettifyHotkey(spec: string): string {
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  return spec
    .split('+')
    .map((p) => {
      if (p.toLowerCase() === 'mod') return isMac ? '\u2318' : 'Ctrl';
      if (p.toLowerCase() === 'shift') return isMac ? '\u21e7' : 'Shift';
      if (p.toLowerCase() === 'backspace') return '\u232b';
      return p.length === 1 ? p.toUpperCase() : p;
    })
    .join(isMac ? '' : '+');
}
