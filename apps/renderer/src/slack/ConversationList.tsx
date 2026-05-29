import { Avatar, Badge, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconAt, IconHash, IconUser, IconUsers } from '@tabler/icons-react';
import type { ChatConversation } from '@gingermail/core';

function kindIcon(kind: ChatConversation['kind']) {
  switch (kind) {
    case 'im':
      return <IconUser size={14} aria-hidden />;
    case 'mpim':
      return <IconUsers size={14} aria-hidden />;
    default:
      return <IconHash size={14} aria-hidden />;
  }
}

/**
 * Left-rail conversation list. Mentions + DMs float to the top (the main
 * process already sorts by `hasMention DESC, lastMessageAt DESC`). Unread is
 * shown as a calm count badge; an @-mention adds a small accent marker so it
 * stands out without flashing colour everywhere.
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (c: ChatConversation) => void;
}) {
  return (
    <Stack gap={2} p="xs" role="listbox" aria-label="Conversations">
      {conversations.map((c) => {
        const active = c.id === activeId;
        return (
          <UnstyledButton
            key={c.id}
            role="option"
            aria-selected={active}
            onClick={() => onSelect(c)}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: active ? 'var(--mantine-color-default-hover)' : undefined,
            }}
          >
            <Group gap="xs" wrap="nowrap" justify="space-between">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                {c.kind === 'im' ? (
                  <Avatar size={22} radius="xl" color="ginger" variant="light">
                    {initials(c.name)}
                  </Avatar>
                ) : (
                  kindIcon(c.kind)
                )}
                <Text size="sm" truncate fw={c.unreadCount > 0 ? 700 : 400}>
                  {c.name}
                </Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                {c.hasMention && (
                  <Badge size="xs" circle variant="filled" color="ginger" aria-label="Mentions you">
                    <IconAt size={10} />
                  </Badge>
                )}
                {c.unreadCount > 0 && (
                  <Badge size="sm" variant="light" color={c.hasMention ? 'ginger' : 'gray'}>
                    {c.unreadCount > 99 ? '99+' : c.unreadCount}
                  </Badge>
                )}
              </Group>
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
