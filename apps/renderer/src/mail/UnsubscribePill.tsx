import { Badge, Button, Code, Group, Popover, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMailOff } from '@tabler/icons-react';
import { useState } from 'react';
import type { Message } from '@gingermail/core';
import { getApi } from '../ipcBridge';

/**
 * Inline pill shown on the message header when the open message advertises
 * a `List-Unsubscribe` header. Offers the canonical "Unsubscribe" (real
 * RFC 8058 one-click POST) and the local "Mute sender" side-by-side, per
 * the agreed UX. No automation \u2014 nothing happens without a click.
 */
export function UnsubscribePill({ message }: { message: Message }): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmingHttp, setConfirmingHttp] = useState(false);
  const http = message.listUnsubscribeHttp;
  const mailto = message.listUnsubscribeMailto;
  const oneClick = message.listUnsubscribePost === true;
  if (!http && !mailto) return null;
  const senderEmail = message.from.email;
  let httpHost = '';
  if (http) {
    try {
      httpHost = new URL(http).host;
    } catch {
      httpHost = '';
    }
  }

  const unsubscribe = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await getApi().unsubscribe.perform({
        email: senderEmail,
        http,
        mailto,
        oneClick,
      });
      if (res.ok && res.method === 'http') {
        notifications.show({ title: 'Unsubscribed', message: senderEmail, color: 'green' });
      } else if (res.method === 'mailto') {
        notifications.show({
          title: 'Open the composer to finish',
          message: `Send the prepared mail to unsubscribe from ${senderEmail}.`,
          color: 'orange',
        });
      } else {
        notifications.show({
          title: 'Unsubscribe failed',
          message: res.error ?? 'Unknown error',
          color: 'red',
        });
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const mute = async (): Promise<void> => {
    setBusy(true);
    try {
      await getApi().unsubscribe.mute({ email: senderEmail });
      notifications.show({
        title: 'Muted',
        message: `Future mail from ${senderEmail} will be hidden from your inbox and search.`,
        color: 'gray',
      });
    } finally {
      setBusy(false);
      setOpen(false);
      setConfirmingHttp(false);
    }
  };

  const startUnsubscribe = (): void => {
    if (http && oneClick) {
      setConfirmingHttp(true);
      return;
    }
    void unsubscribe();
  };

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" shadow="md" withinPortal>
      <Popover.Target>
        <Badge
          variant="light"
          color="ginger"
          leftSection={<IconMailOff size={12} />}
          style={{ cursor: 'pointer' }}
          onClick={() => setOpen((s) => !s)}
          aria-label="Unsubscribe or mute this sender"
        >
          Unsubscribe?
        </Badge>
      </Popover.Target>
      <Popover.Dropdown>
        {confirmingHttp ? (
          <Stack gap="xs" maw={320}>
            <Text size="sm">GingerMail will POST a one-click unsubscribe to:</Text>
            <Code block style={{ wordBreak: 'break-all' }}>
              {http}
            </Code>
            {httpHost && (
              <Text size="xs" c="dimmed">
                Destination host: <Code>{httpHost}</Code>
              </Text>
            )}
            <Group gap="xs" justify="flex-end" wrap="nowrap">
              <Button
                size="xs"
                variant="default"
                disabled={busy}
                onClick={() => setConfirmingHttp(false)}
              >
                Cancel
              </Button>
              <Button size="xs" color="ginger" loading={busy} onClick={() => void unsubscribe()}>
                Send
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="xs" maw={280}>
            <Text size="sm">
              This sender supports unsubscribing. Pick one: send the real unsubscribe to the sender,
              or mute them privately inside GingerMail.
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Button size="xs" disabled={busy} onClick={startUnsubscribe}>
                Unsubscribe
              </Button>
              <Button
                size="xs"
                variant="light"
                color="gray"
                disabled={busy}
                onClick={() => void mute()}
              >
                Mute sender
              </Button>
            </Group>
          </Stack>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
