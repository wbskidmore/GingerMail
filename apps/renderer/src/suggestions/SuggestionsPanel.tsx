import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Group,
  Indicator,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBell,
  IconCalendarEvent,
  IconChecklist,
  IconMail,
  IconSparkles,
} from '@tabler/icons-react';
import type { Suggestion, SuggestionCategory } from '@gingermail/core';
import { getApi } from '../ipcBridge.js';

const CATEGORY_META: Record<SuggestionCategory, { label: string; icon: typeof IconMail; color: string }> = {
  email: { label: 'Email', icon: IconMail, color: 'blue' },
  reminder: { label: 'Reminder', icon: IconBell, color: 'orange' },
  event: { label: 'Event', icon: IconCalendarEvent, color: 'grape' },
  task: { label: 'Task', icon: IconChecklist, color: 'teal' },
};

function CategoryBadge({ category }: { category: SuggestionCategory }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <Badge variant="light" color={meta.color} leftSection={<Icon size={11} />} tt="none">
      {meta.label}
    </Badge>
  );
}

function whenText(s: Suggestion): string | undefined {
  const iso = s.payload.when ?? s.payload.due;
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toLocaleString();
}

/**
 * Entry point button for the AI detection review panel. Lives in the ActionBar.
 * Shows a count badge of pending suggestions and opens a drawer where the user
 * accepts / rejects each one (and can undo recently auto-added items).
 */
export function SuggestionsButton() {
  const [opened, setOpened] = useState(false);
  const [pending, setPending] = useState<Suggestion[]>([]);
  const [autoAdded, setAutoAdded] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [p, a] = await Promise.all([
        getApi().suggestions.list({ status: 'pending' }),
        getApi().suggestions.list({ status: 'auto-added' }),
      ]);
      setPending(p);
      setAutoAdded(a);
    } catch {
      /* main not ready / AI off: leave lists empty */
    }
  }, []);

  useEffect(() => {
    void load();
    const off = getApi().suggestions.onChanged(() => void load());
    return off;
  }, [load]);

  const accept = async (s: Suggestion): Promise<void> => {
    setBusy(s.id);
    try {
      const res = await getApi().suggestions.accept({ id: s.id });
      if (s.category === 'email' && res.draft) {
        // Email is never sent automatically — persist it as a draft instead.
        try {
          await getApi().mail.saveDraft(res.draft);
          notifications.show({ title: 'Draft saved', message: s.title, color: 'green', autoClose: 2200 });
        } catch {
          notifications.show({ title: 'Draft prepared', message: 'Open Mail to finish and send it.', color: 'blue' });
        }
      } else {
        notifications.show({ title: 'Added', message: s.title, color: 'green', autoClose: 2000 });
      }
      await load();
    } catch (e) {
      notifications.show({ title: 'Could not add', message: (e as Error).message, color: 'red' });
    } finally {
      setBusy(null);
    }
  };

  const reject = async (s: Suggestion): Promise<void> => {
    setBusy(s.id);
    try {
      await getApi().suggestions.reject({ id: s.id });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (s: Suggestion): Promise<void> => {
    setBusy(s.id);
    try {
      await getApi().suggestions.dismiss({ id: s.id });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Tooltip label="AI suggestions">
        <Indicator color="ginger" size={16} label={pending.length > 9 ? '9+' : pending.length} disabled={pending.length === 0} offset={4}>
          <ActionIcon
            data-no-drag
            variant="subtle"
            color="gray"
            aria-label="AI suggestions"
            onClick={() => setOpened(true)}
          >
            <IconSparkles size={16} />
          </ActionIcon>
        </Indicator>
      </Tooltip>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="right"
        size="md"
        title={<Group gap="xs"><IconSparkles size={16} /><Text fw={700}>AI suggestions</Text></Group>}
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap="md">
          {pending.length === 0 && autoAdded.length === 0 && (
            <Text size="sm" c="dimmed">
              Nothing here yet. When detection agents are on, actionable items the AI finds in your chat and mail
              show up here for review. Configure them in Settings → AI.
            </Text>
          )}

          {pending.length > 0 && (
            <Stack gap="xs">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">Needs review</Text>
              {pending.map((s) => (
                <Card key={s.id} withBorder radius="md" p="sm">
                  <Stack gap={6}>
                    <Group justify="space-between" wrap="nowrap">
                      <CategoryBadge category={s.category} />
                      {s.sourceLabel && <Text size="xs" c="dimmed" truncate>{s.sourceLabel}</Text>}
                    </Group>
                    <Text size="sm" fw={500}>{s.title}</Text>
                    {whenText(s) && <Text size="xs" c="dimmed">{whenText(s)}</Text>}
                    {s.category === 'email' && s.payload.to && (
                      <Text size="xs" c="dimmed">To: {s.payload.to}</Text>
                    )}
                    <Group gap="xs" justify="flex-end">
                      <Button size="xs" variant="subtle" color="gray" loading={busy === s.id} onClick={() => void dismiss(s)}>
                        Dismiss
                      </Button>
                      <Button size="xs" variant="subtle" color="red" loading={busy === s.id} onClick={() => void reject(s)}>
                        Reject
                      </Button>
                      <Button size="xs" loading={busy === s.id} onClick={() => void accept(s)}>
                        {s.category === 'email' ? 'Save draft' : 'Add'}
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}

          {autoAdded.length > 0 && (
            <Stack gap="xs">
              <Divider />
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">Auto-added</Text>
              {autoAdded.map((s) => (
                <Card key={s.id} withBorder radius="md" p="sm">
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                      <ThemeIcon variant="light" size="sm" color={CATEGORY_META[s.category].color}>
                        {(() => { const Icon = CATEGORY_META[s.category].icon; return <Icon size={12} />; })()}
                      </ThemeIcon>
                      <Text size="sm" truncate>{s.title}</Text>
                    </Group>
                    <Button size="xs" variant="subtle" color="gray" loading={busy === s.id} onClick={() => void dismiss(s)}>
                      Dismiss
                    </Button>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Drawer>
    </>
  );
}
