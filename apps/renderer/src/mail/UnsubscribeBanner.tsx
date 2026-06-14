import { useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Button,
  Code,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMailOff } from '@tabler/icons-react';
import type { UnsubscribeSuggestion } from '@gingermail/core';
import { getApi } from '../ipcBridge';

/**
 * Inbox banner that surfaces unsubscribe suggestions. Hidden when there
 * are zero candidates. Clicking the CTA opens a review modal where the
 * user gets per-sender control \u2014 we never act on more than one sender
 * at a time without explicit confirmation.
 */
export function UnsubscribeBanner(): JSX.Element | null {
  const [suggestions, setSuggestions] = useState<UnsubscribeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Pending HTTPS unsubscribe awaiting destination confirmation. Plan
  // requires we never call out silently \u2014 user sees the parsed URL first.
  const [pendingUnsub, setPendingUnsub] = useState<UnsubscribeSuggestion | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      const list = await getApi().unsubscribe.listSuggestions();
      setSuggestions(list);
    } catch {
      setSuggestions([]);
    }
  };

  useEffect(() => {
    void refresh();
    // Refresh whenever a sync completes so newly-trashed mail can shift the
    // heuristic, but throttle to once a minute to avoid burning AI tokens.
    let lastRun = Date.now();
    const unsubscribe = getApi().mail.onSync(() => {
      if (Date.now() - lastRun < 60_000) return;
      lastRun = Date.now();
      void refresh();
    });
    return () => unsubscribe();
  }, []);

  if (suggestions.length === 0) return null;

  const count = suggestions.length;
  const top = suggestions
    .slice(0, 3)
    .map((s) => s.email)
    .join(', ');

  return (
    <>
      <Alert
        icon={<IconMailOff size={16} />}
        color="ginger"
        variant="light"
        radius={0}
        styles={{
          root: {
            borderTop: 0,
            borderInline: 0,
            borderBottom: '1px solid var(--mantine-color-default-border)',
          },
        }}
      >
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Text size="sm" lineClamp={2}>
            You routinely trash mail from {count === 1 ? '1 sender' : `${count} senders`} ({top}
            {count > 3 ? ', \u2026' : ''}). Want to clean them up?
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Button size="xs" variant="light" onClick={() => setOpen(true)}>
              Review
            </Button>
          </Group>
        </Group>
      </Alert>
      <UnsubscribeReviewModal
        opened={open}
        onClose={() => setOpen(false)}
        suggestions={suggestions}
        busy={busy}
        onAct={async (s, action) => {
          if (action === 'unsubscribe') {
            // Pre-flight: if there's an HTTPS one-click endpoint, force a
            // confirmation dialog so the user sees the destination URL before
            // we POST anything. mailto-only senders skip straight to compose.
            if (s.methods.http && s.methods.oneClick) {
              setPendingUnsub(s);
              return;
            }
            await runUnsubscribe(s);
            return;
          }
          setBusy(true);
          try {
            if (action === 'mute') {
              await getApi().unsubscribe.mute({ email: s.email });
              notifications.show({
                title: 'Muted',
                message: `Future mail from ${s.email} will be hidden from your inbox and search.`,
                color: 'gray',
              });
            } else if (action === 'dismiss') {
              await getApi().unsubscribe.dismiss({ email: s.email });
            }
          } finally {
            setBusy(false);
            await refresh();
          }
        }}
      />
      <UnsubscribeDestinationConfirm
        suggestion={pendingUnsub}
        busy={busy}
        onCancel={() => setPendingUnsub(null)}
        onConfirm={async () => {
          const s = pendingUnsub;
          if (!s) return;
          setPendingUnsub(null);
          await runUnsubscribe(s);
        }}
      />
    </>
  );

  async function runUnsubscribe(s: UnsubscribeSuggestion): Promise<void> {
    setBusy(true);
    try {
      const res = await getApi().unsubscribe.perform({
        email: s.email,
        http: s.methods.http,
        mailto: s.methods.mailto,
        oneClick: s.methods.oneClick,
      });
      if (res.ok && res.method === 'http') {
        notifications.show({ title: 'Unsubscribed', message: s.email, color: 'green' });
      } else if (res.method === 'mailto') {
        notifications.show({
          title: 'Open the composer to finish',
          message: `Send the prepared mail to unsubscribe from ${s.email}.`,
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
      await refresh();
    }
  }
}

interface ConfirmProps {
  suggestion: UnsubscribeSuggestion | null;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * Destination-confirmation modal: shown before any HTTPS POST. Renders the
 * fully-parsed URL in monospace so the user can spot phishing-style domains
 * before we send the request. There is no "remember this choice" affordance
 * \u2014 every send is confirmed.
 */
function UnsubscribeDestinationConfirm({
  suggestion,
  busy,
  onConfirm,
  onCancel,
}: ConfirmProps): JSX.Element {
  const url = suggestion?.methods.http ?? '';
  let host = '';
  try {
    host = url ? new URL(url).host : '';
  } catch {
    host = '';
  }
  return (
    <Modal opened={Boolean(suggestion)} onClose={onCancel} title="Confirm unsubscribe">
      <Stack gap="sm">
        <Text size="sm">
          GingerMail will send a one-click <Code>POST</Code> to the address below to unsubscribe
          from <strong>{suggestion?.email}</strong>. No cookies or credentials are sent.
        </Text>
        <Code block style={{ wordBreak: 'break-all' }}>
          {url || '(no destination)'}
        </Code>
        {host && (
          <Text size="xs" c="dimmed">
            Destination host: <Code>{host}</Code>
          </Text>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button color="ginger" onClick={() => void onConfirm()} loading={busy} disabled={!url}>
            Send unsubscribe
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface ModalProps {
  opened: boolean;
  onClose: () => void;
  suggestions: UnsubscribeSuggestion[];
  busy: boolean;
  onAct: (s: UnsubscribeSuggestion, action: 'unsubscribe' | 'mute' | 'dismiss') => Promise<void>;
}

function UnsubscribeReviewModal({
  opened,
  onClose,
  suggestions,
  busy,
  onAct,
}: ModalProps): JSX.Element {
  return (
    <Modal opened={opened} onClose={onClose} title="Unsubscribe suggestions" size="lg">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          For each sender you can either run the sender&apos;s real unsubscribe (RFC 8058 one-click
          POST or a prepared mailto), or mute them locally so future mail is auto-marked read.
          Muting is private to GingerMail and reversible from Settings &rarr; Privacy.
        </Text>
        <ScrollArea h={420}>
          <Stack gap="xs">
            {suggestions.map((s) => (
              <Stack
                key={s.email}
                gap={4}
                p="sm"
                style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={0}>
                    <Title order={5} size="sm">
                      {s.email}
                    </Title>
                    <Text size="xs" c="dimmed">
                      Trashed {s.trashedCount} of last {s.totalSeen}
                      {s.aiReason ? ` \u00b7 AI: ${s.aiReason}` : ''}
                    </Text>
                  </Stack>
                  <Group gap="xs" wrap="nowrap">
                    {(s.methods.http || s.methods.mailto) && (
                      <Button size="xs" disabled={busy} onClick={() => onAct(s, 'unsubscribe')}>
                        Unsubscribe
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      disabled={busy}
                      onClick={() => onAct(s, 'mute')}
                    >
                      Mute sender
                    </Button>
                    <Anchor size="xs" c="dimmed" onClick={() => void onAct(s, 'dismiss')}>
                      Not junk
                    </Anchor>
                  </Group>
                </Group>
              </Stack>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    </Modal>
  );
}
