import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCalendar,
  IconCalendarPlus,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconMapPin,
  IconPencil,
  IconRepeat,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import type { Calendar, CalendarEvent } from '@gingermail/core';
import { EmptyState } from '@gingermail/ui-kit';
import { getApi } from '../ipcBridge.js';
import { EventComposer } from './EventComposer.js';

type ViewMode = 'day' | 'workweek' | 'week' | 'month';

export function CalendarTab() {
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [composer, setComposer] = useState<{
    open: boolean;
    event: CalendarEvent | null;
    initialStart?: number;
  }>({ open: false, event: null });

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const list = await getApi().calendar.listEvents({ from: range.from, to: range.to });
      setEvents(list);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Load writable calendars once for the composer's account/calendar picker.
  useEffect(() => {
    void (async () => {
      try {
        setCalendars(await getApi().calendar.listCalendars());
      } catch {
        setCalendars([]);
      }
    })();
  }, []);

  const writableCalendars = useMemo(() => calendars.filter((c) => !c.readonly), [calendars]);

  const openCreate = (): void => setComposer({ open: true, event: null });
  const openEdit = (event: CalendarEvent): void => {
    setDetail(null);
    setComposer({ open: true, event });
  };

  const handleSaved = (saved: CalendarEvent, mode: 'create' | 'update'): void => {
    setEvents((prev) =>
      mode === 'update'
        ? prev.map((e) => (e.id === saved.id ? saved : e))
        : [...prev.filter((e) => e.id !== saved.id), saved],
    );
    // Re-pull so provider-rewritten ids / synced fields stay consistent.
    void reload();
  };

  const handleDelete = (event: CalendarEvent): void => {
    modals.openConfirmModal({
      title: 'Delete event',
      children: <Text size="sm">Delete "{event.title}"? This cannot be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        void (async () => {
          try {
            await getApi().calendar.deleteEvent(event.id);
            setEvents((prev) => prev.filter((e) => e.id !== event.id));
            setDetail(null);
            notifications.show({ title: 'Event deleted', message: event.title });
          } catch (err) {
            notifications.show({
              color: 'red',
              title: 'Could not delete event',
              message: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        })();
      },
    });
  };

  return (
    <Stack gap={0} h="100%">
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group gap="xs">
          <Tooltip label="Previous">
            <ActionIcon
              variant="subtle"
              onClick={() => setAnchor(shift(anchor, view, -1))}
              aria-label="Previous"
            >
              <IconChevronLeft size={16} />
            </ActionIcon>
          </Tooltip>
          <Button variant="default" size="xs" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Tooltip label="Next">
            <ActionIcon
              variant="subtle"
              onClick={() => setAnchor(shift(anchor, view, 1))}
              aria-label="Next"
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </Tooltip>
          <Title order={5} m={0} ml="sm">
            {formatHeader(view, anchor)}
          </Title>
          {loading && <Loader size="xs" type="dots" />}
        </Group>
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => setView(v as ViewMode)}
            data={[
              { value: 'day', label: 'Day' },
              { value: 'workweek', label: 'Work week' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
          <Button size="xs" leftSection={<IconCalendarPlus size={14} />} onClick={openCreate}>
            New event
          </Button>
        </Group>
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        {events.length === 0 ? (
          <EmptyState
            icon={<IconCalendar size={28} />}
            title="No events in this range"
            description="Either nothing is scheduled, or no calendar accounts are connected yet."
          />
        ) : view === 'month' ? (
          <MonthView events={events} anchor={anchor} onOpen={setDetail} />
        ) : (
          <WeekView events={events} range={range} onOpen={setDetail} />
        )}
      </Box>

      <EventComposer
        opened={composer.open}
        onClose={() => setComposer((c) => ({ ...c, open: false }))}
        calendars={writableCalendars}
        event={composer.event}
        initialStart={composer.initialStart}
        onSaved={handleSaved}
      />

      <EventDetail
        event={detail}
        onClose={() => setDetail(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
      />
    </Stack>
  );
}

function EventDetail({
  event,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
}) {
  const recurring = !!event?.recurrenceRule;
  return (
    <Modal opened={!!event} onClose={onClose} title={event?.title ?? ''} size="md">
      {event && (
        <Stack gap="sm">
          <Group gap="xs" wrap="nowrap">
            <IconClock size={16} />
            <Text size="sm">
              {event.allDay
                ? 'All day'
                : `${new Date(event.start).toLocaleString()} - ${new Date(event.end).toLocaleString()}`}
            </Text>
          </Group>
          {event.location && (
            <Group gap="xs" wrap="nowrap">
              <IconMapPin size={16} />
              <Text size="sm">{event.location}</Text>
            </Group>
          )}
          {recurring && (
            <Group gap="xs" wrap="nowrap">
              <IconRepeat size={16} />
              <Text size="sm" c="dimmed">
                Repeating event
              </Text>
            </Group>
          )}
          {event.status !== 'confirmed' && (
            <Badge variant="light" color={event.status === 'cancelled' ? 'red' : 'yellow'}>
              {event.status}
            </Badge>
          )}
          {event.organizer && (
            <Text size="sm">
              <strong>Organizer: </strong>
              {event.organizer.name ?? event.organizer.email}
            </Text>
          )}
          {event.attendees && event.attendees.length > 0 && (
            <Stack gap={4}>
              <Group gap="xs" wrap="nowrap">
                <IconUsers size={16} />
                <Text size="sm" fw={500}>
                  {event.attendees.length} guest{event.attendees.length > 1 ? 's' : ''}
                </Text>
              </Group>
              {event.attendees.map((a) => (
                <Text key={a.email} size="sm" c="dimmed" ml={24}>
                  {a.name ? `${a.name} (${a.email})` : a.email}
                </Text>
              ))}
            </Stack>
          )}
          {event.reminders && event.reminders.length > 0 && (
            <Text size="sm" c="dimmed">
              Reminders: {event.reminders.map(formatReminder).join(', ')}
            </Text>
          )}
          {event.description && (
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {event.description}
            </Text>
          )}
          <Divider />
          <Group justify="space-between">
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => onDelete(event)}
            >
              Delete
            </Button>
            <Tooltip
              label="Editing repeating events isn't supported yet"
              disabled={!recurring}
              withArrow
            >
              <Button
                leftSection={<IconPencil size={14} />}
                onClick={() => onEdit(event)}
                disabled={recurring}
              >
                Edit
              </Button>
            </Tooltip>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function formatReminder(minutes: number): string {
  if (minutes === 0) return 'at start';
  if (minutes % 1440 === 0) return `${minutes / 1440}d before`;
  if (minutes % 60 === 0) return `${minutes / 60}h before`;
  return `${minutes}m before`;
}

function WeekView({
  events,
  range,
  onOpen,
}: {
  events: CalendarEvent[];
  range: { from: number; to: number };
  onOpen: (e: CalendarEvent) => void;
}) {
  const days: Date[] = [];
  const start = new Date(range.from);
  const dayCount = Math.ceil((range.to - range.from) / 86_400_000);
  for (let i = 0; i < dayCount; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const today = new Date();
  return (
    <ScrollArea h="100%">
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${days.length}, 1fr)`,
          gap: 1,
          background: 'var(--mantine-color-default-border)',
          minHeight: '100%',
        }}
      >
        {days.map((d) => {
          const dayEvents = events.filter(
            (e) => sameDay(new Date(e.start), d) || (new Date(e.start) < d && new Date(e.end) > d),
          );
          const isToday = sameDay(d, today);
          return (
            <Paper key={d.toDateString()} radius={0} p="sm" style={{ minHeight: 280 }}>
              <Group justify="space-between" mb="xs">
                <Text size="xs" c="dimmed" tt="uppercase">
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </Text>
                <Badge
                  size="sm"
                  variant={isToday ? 'filled' : 'transparent'}
                  color={isToday ? 'ginger' : 'gray'}
                  radius="xl"
                >
                  {d.getDate()}
                </Badge>
              </Group>
              <Stack gap={4}>
                {dayEvents.map((e) => (
                  <Paper
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(e)}
                    onKeyDown={(k) => k.key === 'Enter' && onOpen(e)}
                    p={6}
                    radius="sm"
                    style={{
                      background: 'var(--mantine-color-ginger-light)',
                      borderLeft: '3px solid var(--mantine-color-ginger-6)',
                      cursor: 'pointer',
                    }}
                  >
                    <Text size="xs" c="dimmed">
                      {e.allDay ? 'All day' : formatTimeRange(e)}
                    </Text>
                    <Text size="sm" fw={500} lineClamp={2}>
                      {e.title}
                    </Text>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          );
        })}
      </Box>
    </ScrollArea>
  );
}

function MonthView({
  events,
  anchor,
  onOpen,
}: {
  events: CalendarEvent[];
  anchor: Date;
  onOpen: (e: CalendarEvent) => void;
}) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - start.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  const today = new Date();
  return (
    <ScrollArea h="100%">
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <Box
            key={d}
            p="xs"
            ta="center"
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            <Text size="xs" c="dimmed" tt="uppercase">
              {d}
            </Text>
          </Box>
        ))}
        {cells.map((d) => {
          const dayEvents = events.filter((e) => sameDay(new Date(e.start), d));
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = sameDay(d, today);
          return (
            <Box
              key={d.toISOString()}
              p={6}
              style={{
                borderRight: '1px solid var(--mantine-color-default-border)',
                borderBottom: '1px solid var(--mantine-color-default-border)',
                minHeight: 92,
                opacity: inMonth ? 1 : 0.5,
              }}
            >
              <Badge
                size="sm"
                variant={isToday ? 'filled' : 'transparent'}
                color={isToday ? 'ginger' : 'gray'}
                radius="xl"
              >
                {d.getDate()}
              </Badge>
              <Stack gap={2} mt={4}>
                {dayEvents.slice(0, 3).map((e) => (
                  <Text
                    key={e.id}
                    size="xs"
                    px={6}
                    style={{
                      background: 'var(--mantine-color-ginger-light)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                    lineClamp={1}
                    onClick={() => onOpen(e)}
                  >
                    {e.title}
                  </Text>
                ))}
                {dayEvents.length > 3 && (
                  <Text size="xs" c="dimmed">
                    +{dayEvents.length - 3} more
                  </Text>
                )}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </ScrollArea>
  );
}

function rangeFor(view: ViewMode, anchor: Date): { from: number; to: number } {
  if (view === 'day') {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { from: start.getTime(), to: end.getTime() };
  }
  if (view === 'week') {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { from: start.getTime(), to: end.getTime() };
  }
  if (view === 'workweek') {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 5);
    return { from: start.getTime(), to: end.getTime() };
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  return { from: start.getTime(), to: end.getTime() };
}

function shift(d: Date, view: ViewMode, dir: -1 | 1): Date {
  const x = new Date(d);
  if (view === 'day') x.setDate(x.getDate() + dir);
  else if (view === 'week' || view === 'workweek') x.setDate(x.getDate() + dir * 7);
  else x.setMonth(x.getMonth() + dir);
  return x;
}

function formatHeader(view: ViewMode, anchor: Date): string {
  if (view === 'day')
    return anchor.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  if (view === 'month')
    return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const r = rangeFor(view, anchor);
  return `${new Date(r.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(r.to - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function formatTimeRange(e: CalendarEvent): string {
  const f = (ts: number) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${f(e.start)}–${f(e.end)}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

