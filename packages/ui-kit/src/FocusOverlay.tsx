import { useEffect, useState } from 'react';
import { Affix, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconFocus2 } from '@tabler/icons-react';
import { focusRemainingMs, type FocusState } from '@gingermail/core';

export interface FocusOverlayProps {
  state: FocusState;
  onStop: () => void;
}

/**
 * Minimal, low-stimulation focus indicator. Anchored to the bottom-center
 * so it never obscures the active conversation/event/task.
 */
export function FocusOverlay({ state, onStop }: FocusOverlayProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!state.active) return null;

  const remaining = focusRemainingMs(state);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return (
    <Affix position={{ bottom: 24, left: '50%' }} style={{ transform: 'translateX(-50%)' }}>
      <Paper shadow="md" radius="xl" p="md" withBorder>
        <Group gap="md" wrap="nowrap">
          <IconFocus2 size={22} />
          <Stack gap={2}>
            <Title order={6} m={0}>
              Focus mode
            </Title>
            <Text size="xs" c="dimmed">
              Notifications paused. One thing at a time.
            </Text>
          </Stack>
          <Text
            fw={600}
            ff="monospace"
            size="xl"
            c="ginger.6"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Button variant="subtle" size="xs" onClick={onStop}>
            End
          </Button>
        </Group>
      </Paper>
    </Affix>
  );
}
