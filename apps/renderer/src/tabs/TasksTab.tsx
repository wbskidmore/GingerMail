import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  NavLink,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChecklist,
  IconClock,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconTrash,
} from '@tabler/icons-react';
import type { Task, TaskList } from '@gingermail/core';
import { EmptyState, EnergyChip, SnoozeMenu } from '@gingermail/ui-kit';
import { getApi } from '../ipcBridge.js';

export function TasksTab() {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [activeListId, setActiveListId] = useState<string | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [hideDone, setHideDone] = useState(true);

  useEffect(() => {
    void (async () => {
      const list = await getApi().tasks.listLists();
      setLists(list);
      if (list[0]) setActiveListId(list[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!activeListId) return;
    void getApi().tasks.listTasks(activeListId).then(setTasks);
  }, [activeListId]);

  const visible = tasks.filter((t) => (hideDone ? t.status !== 'completed' : true));

  const onAdd = async (): Promise<void> => {
    if (!newTitle.trim() || !activeListId) return;
    const list = lists.find((l) => l.id === activeListId);
    if (!list) return;
    const created = await getApi().tasks.createTask({
      listId: activeListId,
      accountId: list.accountId,
      title: newTitle.trim(),
      status: 'open',
      starred: false,
    });
    setTasks((t) => [...t, created]);
    setNewTitle('');
  };

  return (
    <Box
      style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%', minHeight: 0 }}
    >
      <Paper
        withBorder={false}
        radius={0}
        p="sm"
        style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}
      >
        <Stack gap={4}>
          {lists.length === 0 ? (
            <Text size="xs" c="dimmed" p="sm">
              No lists yet.
            </Text>
          ) : (
            lists.map((l) => (
              <NavLink
                key={l.id}
                label={l.name}
                active={l.id === activeListId}
                onClick={() => setActiveListId(l.id)}
                rightSection={
                  <Badge size="xs" variant="light">
                    {tasks.filter((t) => t.listId === l.id && t.status === 'open').length}
                  </Badge>
                }
                variant="filled"
              />
            ))
          )}
        </Stack>
      </Paper>

      <Stack gap={0} h="100%" style={{ minHeight: 0 }}>
        <Group
          justify="space-between"
          px="md"
          py="xs"
          style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
          <Text fw={600}>{lists.find((l) => l.id === activeListId)?.name ?? 'Tasks'}</Text>
          <Switch
            label="Hide completed"
            checked={hideDone}
            onChange={(e) => setHideDone(e.currentTarget.checked)}
            size="xs"
          />
        </Group>

        <Group
          px="md"
          py="sm"
          gap="xs"
          style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
          <TextInput
            placeholder="Add a task and press Enter"
            value={newTitle}
            onChange={(e) => setNewTitle(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void onAdd()}
            leftSection={<IconPlus size={14} />}
            style={{ flex: 1 }}
            aria-label="New task"
          />
          <Button
            size="sm"
            leftSection={<IconPlus size={14} />}
            onClick={() => void onAdd()}
            disabled={!newTitle.trim()}
          >
            Add
          </Button>
        </Group>

        {visible.length === 0 ? (
          <EmptyState
            icon={<IconChecklist size={28} />}
            title="Nothing to do"
            description="Add a task above to get started."
          />
        ) : (
          <ScrollArea h="100%">
            <Stack gap={0}>
              {visible.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={async () => {
                    if (t.status === 'completed') {
                      const updated = await getApi().tasks.reopen(t.id);
                      setTasks((arr) => arr.map((x) => (x.id === t.id ? updated : x)));
                    } else {
                      const updated = await getApi().tasks.complete(t.id);
                      setTasks((arr) => arr.map((x) => (x.id === t.id ? updated : x)));
                    }
                  }}
                  onStar={async () => {
                    const updated = await getApi().tasks.updateTask({ ...t, starred: !t.starred });
                    setTasks((arr) => arr.map((x) => (x.id === t.id ? updated : x)));
                  }}
                  onSnooze={async (fireAt) => {
                    const updated = await getApi().tasks.updateTask({ ...t, snoozedUntil: fireAt });
                    setTasks((arr) => arr.map((x) => (x.id === t.id ? updated : x)));
                    notifications.show({ title: 'Snoozed', message: `${t.title}` });
                  }}
                  onDelete={async () => {
                    await getApi().tasks.deleteTask(t.id);
                    setTasks((arr) => arr.filter((x) => x.id !== t.id));
                  }}
                />
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Box>
  );
}

interface TaskRowProps {
  task: Task;
  onToggle: () => void;
  onStar: () => void;
  onSnooze: (fireAt: number) => void;
  onDelete: () => void;
}

function TaskRow({ task, onToggle, onStar, onSnooze, onDelete }: TaskRowProps) {
  const overdue = task.due !== undefined && task.due < Date.now() && task.status === 'open';
  return (
    <Group
      px="md"
      py="sm"
      align="flex-start"
      wrap="nowrap"
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Checkbox
        checked={task.status === 'completed'}
        onChange={onToggle}
        color="ginger"
        radius="xl"
        aria-label={task.status === 'completed' ? 'Reopen task' : 'Complete task'}
      />
      <Stack gap={4} style={{ flex: 1 }}>
        <Text
          size="sm"
          fw={task.status === 'completed' ? 400 : 500}
          td={task.status === 'completed' ? 'line-through' : undefined}
          c={task.status === 'completed' ? 'dimmed' : undefined}
        >
          {task.title}
        </Text>
        {task.notes && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {task.notes}
          </Text>
        )}
        <Group gap="xs">
          {task.due && (
            <Badge
              size="xs"
              variant={overdue ? 'filled' : 'light'}
              color={overdue ? 'red' : 'gray'}
              radius="sm"
            >
              Due{' '}
              {new Date(task.due).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Badge>
          )}
          <EnergyChip tag={task.energyTag} />
        </Group>
      </Stack>
      <Group gap={2}>
        <Tooltip label={task.starred ? 'Unstar' : 'Star'}>
          <ActionIcon
            variant="subtle"
            color={task.starred ? 'yellow' : 'gray'}
            onClick={onStar}
            aria-label={task.starred ? 'Unstar' : 'Star'}
          >
            {task.starred ? <IconStarFilled size={14} /> : <IconStar size={14} />}
          </ActionIcon>
        </Tooltip>
        <SnoozeMenu
          target={
            <Tooltip label="Snooze">
              <ActionIcon variant="subtle" aria-label="Snooze">
                <IconClock size={14} />
              </ActionIcon>
            </Tooltip>
          }
          onSelect={(_, fireAt) => onSnooze(fireAt)}
        />
        <Tooltip label="Delete">
          <ActionIcon variant="subtle" color="red" onClick={onDelete} aria-label="Delete">
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}
