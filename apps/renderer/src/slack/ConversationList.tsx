import { Avatar, Badge, Group, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import {
  IconAt,
  IconBrandDiscord,
  IconBrandSlack,
  IconHash,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import type { Account, ChatConversation } from '@gingermail/core';

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
 *
 * When more than one chat account is connected (e.g. a Slack workspace and a
 * Discord bot), conversations are grouped under a per-account header with the
 * provider's icon so it's clear which service a channel belongs to.
 */
export function ConversationList({
  conversations,
  accounts = [],
  activeId,
  onSelect,
}: {
  conversations: ChatConversation[];
  accounts?: Account[];
  activeId: string | null;
  onSelect: (c: ChatConversation) => void;
}) {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const showHeaders = accounts.length > 1;

  // Preserve the main-process ordering while grouping by account.
  const groups: Array<{ accountId: string; items: ChatConversation[] }> = [];
  const indexByAccount = new Map<string, number>();
  for (const c of conversations) {
    let idx = indexByAccount.get(c.accountId);
    if (idx === undefined) {
      idx = groups.length;
      indexByAccount.set(c.accountId, idx);
      groups.push({ accountId: c.accountId, items: [] });
    }
    groups[idx]!.items.push(c);
  }

  return (
    <Stack gap={2} p="xs" role="listbox" aria-label="Conversations">
      {groups.map((g) => {
        const account = accountById.get(g.accountId);
        return (
          <Stack key={g.accountId} gap={2}>
            {showHeaders && (
              <Group gap={6} px={10} pt={6} pb={2} wrap="nowrap">
                <ThemeIcon
                  variant="transparent"
                  size="xs"
                  color={account?.kind === 'discord' ? 'indigo' : 'grape'}
                >
                  {account?.kind === 'discord' ? (
                    <IconBrandDiscord size={13} />
                  ) : (
                    <IconBrandSlack size={13} />
                  )}
                </ThemeIcon>
                <Text size="xs" fw={700} c="dimmed" truncate>
                  {account?.displayName ?? g.accountId}
                </Text>
              </Group>
            )}
            {g.items.map((c) => {
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
                        <Badge
                          size="xs"
                          circle
                          variant="filled"
                          color="ginger"
                          aria-label="Mentions you"
                        >
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
      })}
    </Stack>
  );
}

function initials(name: string): string {
  const parts = name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
