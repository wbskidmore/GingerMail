import { useState } from 'react';
import { ActionIcon, Group, Textarea } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';

/**
 * Slack message composer. Enter sends; Shift+Enter inserts a newline - the
 * convention people already have muscle memory for, so there's nothing new
 * to learn.
 */
export function Composer({ onSend, disabled }: { onSend: (text: string) => Promise<void>; disabled?: boolean }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onSend(text);
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group
      gap="xs"
      align="flex-end"
      p="sm"
      wrap="nowrap"
      style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
    >
      <Textarea
        flex={1}
        autosize
        minRows={1}
        maxRows={6}
        placeholder="Message"
        value={value}
        disabled={disabled || busy}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <ActionIcon
        size="lg"
        variant="filled"
        color="ginger"
        aria-label="Send message"
        loading={busy}
        disabled={disabled || !value.trim()}
        onClick={() => void submit()}
      >
        <IconSend size={18} />
      </ActionIcon>
    </Group>
  );
}
