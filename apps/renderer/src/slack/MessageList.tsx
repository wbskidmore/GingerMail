import { useEffect, useRef } from 'react';
import { ActionIcon, Anchor, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconChecklist } from '@tabler/icons-react';
import type { ChatMessage } from '@gingermail/core';

/**
 * Chronological message pane. Deliberately plain text (mrkdwn is flattened in
 * the provider) with links rendered as openable anchors - keeps the surface
 * low-stimulation and inside the locked-down renderer CSP (no remote images
 * or embedded HTML). Each message offers a "Turn into task" affordance so an
 * actionable Slack message never has to leave GingerMail to be captured.
 */
export function MessageList({
  messages,
  onTurnIntoTask,
}: {
  messages: ChatMessage[];
  onTurnIntoTask: (m: ChatMessage) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  return (
    <Stack gap="sm" p="md" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      {messages.map((m) => (
        <Box
          key={m.id}
          style={{
            padding: '6px 8px',
            borderRadius: 8,
            background: m.mentionsMe ? 'var(--mantine-color-default-hover)' : undefined,
          }}
        >
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
            <Box style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" fw={600}>
                  {m.authorName}
                </Text>
                <Text size="xs" c="dimmed">
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </Group>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.text || (
                  <Text span c="dimmed" size="sm">
                    (no text)
                  </Text>
                )}
              </Text>
              {m.links?.map((url) => (
                <Anchor
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  size="xs"
                  display="block"
                >
                  {url}
                </Anchor>
              ))}
            </Box>
            <Tooltip label="Turn into task" position="left">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Turn this message into a task"
                onClick={() => onTurnIntoTask(m)}
              >
                <IconChecklist size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
      ))}
      <div ref={bottomRef} />
    </Stack>
  );
}
