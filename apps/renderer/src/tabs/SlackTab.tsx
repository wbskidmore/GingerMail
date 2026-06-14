import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Group, Loader, ScrollArea, Stack, Text } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconMessages } from '@tabler/icons-react';
import { EmptyState } from '@gingermail/ui-kit';
import type { Account, ChatConversation, ChatMessage } from '@gingermail/core';
import { getApi } from '../ipcBridge.js';
import { useAppStore } from '../store.js';
import { ConversationList } from '../slack/ConversationList.js';
import { MessageList } from '../slack/MessageList.js';
import { Composer } from '../slack/Composer.js';

export function SlackTab() {
  const setTab = useAppStore((s) => s.setTab);
  const [workspaces, setWorkspaces] = useState<Account[] | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const activeRef = useRef<ChatConversation | null>(null);
  activeRef.current = active;

  const loadConversations = useCallback(async (): Promise<void> => {
    const list = await getApi().slack.listConversations();
    setConversations(list);
  }, []);

  const openConversation = useCallback(async (c: ChatConversation): Promise<void> => {
    setActive(c);
    setLoadingMessages(true);
    try {
      const msgs = await getApi().slack.listMessages({ conversationId: c.id, limit: 50 });
      setMessages(msgs);
      await getApi().slack.markRead({ conversationId: c.id });
      // Reflect the read locally so the unread badge clears immediately.
      setConversations((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, unreadCount: 0, hasMention: false } : x)),
      );
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Initial load: which workspaces are connected, then their conversations.
  useEffect(() => {
    void (async () => {
      const ws = await getApi().slack.listWorkspaces();
      setWorkspaces(ws);
      if (ws.length > 0) {
        await getApi()
          .slack.refresh()
          .catch(() => undefined);
        await loadConversations();
      }
    })();
  }, [loadConversations]);

  // Live updates from the background poller.
  useEffect(() => {
    const off = getApi().slack.onSync((evt) => {
      const e = evt as { type: string; conversationId?: string };
      if (e.type === 'conversations-updated' || e.type === 'finished') {
        void loadConversations();
      }
      if (e.type === 'new-message' && activeRef.current && e.conversationId) {
        // A message arrived in the open conversation: refresh + keep it read.
        const openNative = activeRef.current.conversationId;
        if (e.conversationId === openNative) {
          void getApi()
            .slack.listMessages({ conversationId: activeRef.current.id, limit: 50 })
            .then(setMessages);
        }
      }
    });
    return off;
  }, [loadConversations]);

  // Slack-scoped navigation: Alt+Down / Alt+Up cycle conversations. These only
  // bind while the Slack tab is mounted, so they never fight the global keys.
  useHotkeys([
    ['alt+ArrowDown', () => moveSelection(1)],
    ['alt+ArrowUp', () => moveSelection(-1)],
  ]);

  const moveSelection = (delta: number): void => {
    if (conversations.length === 0) return;
    const idx = active ? conversations.findIndex((c) => c.id === active.id) : -1;
    const next = conversations[Math.min(Math.max(idx + delta, 0), conversations.length - 1)];
    if (next && next.id !== active?.id) void openConversation(next);
  };

  const onSend = async (text: string): Promise<void> => {
    if (!active) return;
    try {
      const sent = await getApi().slack.send({ conversationId: active.id, text });
      setMessages((prev) => [...prev, sent]);
    } catch (e) {
      notifications.show({ title: 'Could not send', message: (e as Error).message, color: 'red' });
    }
  };

  const onTurnIntoTask = async (m: ChatMessage): Promise<void> => {
    try {
      const title =
        m.text.length > 80 ? `${m.text.slice(0, 77)}…` : m.text || `Message from ${m.authorName}`;
      await getApi().tasks.createTask({
        listId: 'local:default',
        accountId: 'local',
        title,
        notes: `From Slack — ${m.authorName} in ${active?.name ?? 'conversation'}:\n\n${m.text}`,
        status: 'open',
        starred: false,
      });
      notifications.show({
        title: 'Added to Tasks',
        message: 'Captured this message on your Tasks tab.',
        color: 'green',
        autoClose: 2200,
      });
    } catch (e) {
      notifications.show({
        title: 'Could not create task',
        message: (e as Error).message,
        color: 'red',
      });
    }
  };

  if (workspaces === null) {
    return (
      <Group justify="center" h="100%">
        <Loader color="ginger" />
      </Group>
    );
  }

  if (workspaces.length === 0) {
    return (
      <EmptyState
        icon={<IconMessages size={28} />}
        title="Connect chat"
        description="Bring your Slack and Discord conversations into GingerMail so you never have to switch apps. Add a workspace or bot from Settings → Chat."
        action={
          <Text
            size="sm"
            c="ginger"
            style={{ cursor: 'pointer' }}
            onClick={() => setTab('settings')}
          >
            Open Settings
          </Text>
        }
      />
    );
  }

  return (
    <Box
      style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '100%', minHeight: 0 }}
    >
      <ScrollArea h="100%" style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
        {conversations.length === 0 ? (
          <Text size="sm" c="dimmed" p="md">
            No conversations yet. They’ll appear here after the first sync.
          </Text>
        ) : (
          <ConversationList
            conversations={conversations}
            accounts={workspaces}
            activeId={active?.id ?? null}
            onSelect={openConversation}
          />
        )}
      </ScrollArea>

      <Stack gap={0} h="100%" style={{ minHeight: 0 }}>
        {active ? (
          <>
            <Group
              px="md"
              py="sm"
              style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
            >
              <Text fw={700}>{active.name}</Text>
            </Group>
            {loadingMessages ? (
              <Group justify="center" flex={1}>
                <Loader color="ginger" size="sm" />
              </Group>
            ) : (
              <MessageList messages={messages} onTurnIntoTask={onTurnIntoTask} />
            )}
            <Composer onSend={onSend} />
          </>
        ) : (
          <EmptyState
            icon={<IconMessages size={28} />}
            title="Pick a conversation"
            description="Choose a DM or channel on the left. Alt+↓ / Alt+↑ move between them."
          />
        )}
      </Stack>
    </Box>
  );
}
