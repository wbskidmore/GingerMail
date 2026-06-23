import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Switch,
  TagsInput,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DatePickerInput, DateTimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import type { Address, Calendar, CalendarEvent } from '@gingermail/core';
import { getApi } from '../ipcBridge.js';

/** Reminder offsets (minutes before start) offered in the composer. */
const REMINDER_OPTIONS = [
  { value: '0', label: 'At time of event' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
];

const HOUR_MS = 60 * 60_000;

/** Synthetic option so users can always create a local-only event. */
const LOCAL_CALENDAR = { id: 'local:default', accountId: 'local', name: 'On this device' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EventComposerProps {
  opened: boolean;
  onClose: () => void;
  /** Writable calendars to choose from (read-only ones are filtered by the caller). */
  calendars: Calendar[];
  /** When set, the composer edits this event; otherwise it creates a new one. */
  event?: CalendarEvent | null;
  /** Seed start time for a new event (e.g. a clicked day/slot). Ignored in edit mode. */
  initialStart?: number;
  onSaved: (event: CalendarEvent, mode: 'create' | 'update') => void;
}

export function EventComposer({
  opened,
  onClose,
  calendars,
  event,
  initialStart,
  onSaved,
}: EventComposerProps) {
  const isEdit = !!event;

  const calendarOptions = useMemo(() => {
    const opts = calendars.map((c) => ({ value: c.id, label: calendarLabel(c) }));
    opts.push({ value: LOCAL_CALENDAR.id, label: LOCAL_CALENDAR.name });
    return opts;
  }, [calendars]);

  const accountByCalendar = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of calendars) map.set(c.id, c.accountId);
    map.set(LOCAL_CALENDAR.id, LOCAL_CALENDAR.accountId);
    return map;
  }, [calendars]);

  const [title, setTitle] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState<Date>(() => roundUpHour(new Date()));
  const [end, setEnd] = useState<Date>(() => new Date(roundUpHour(new Date()).getTime() + HOUR_MS));
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [attendees, setAttendees] = useState<string[]>([]);
  const [reminders, setReminders] = useState<string[]>(['10']);
  const [calendarId, setCalendarId] = useState<string>(LOCAL_CALENDAR.id);
  const [saving, setSaving] = useState(false);

  // Reset the form whenever the modal (re)opens or the target event changes.
  useEffect(() => {
    if (!opened) return;
    if (event) {
      setTitle(event.title);
      setAllDay(event.allDay);
      setStart(new Date(event.start));
      setEnd(new Date(event.end));
      setLocation(event.location ?? '');
      setDescription(event.description ?? '');
      setAttendees((event.attendees ?? []).map((a) => a.email));
      setReminders((event.reminders ?? []).map(String));
      setCalendarId(event.calendarId);
    } else {
      const base = initialStart ? roundUpHour(new Date(initialStart)) : roundUpHour(new Date());
      setTitle('');
      setAllDay(false);
      setStart(base);
      setEnd(new Date(base.getTime() + HOUR_MS));
      setLocation('');
      setDescription('');
      setAttendees([]);
      setReminders(['10']);
      const primary = calendars.find((c) => c.primary) ?? calendars[0];
      setCalendarId(primary?.id ?? LOCAL_CALENDAR.id);
    }
  }, [opened, event, initialStart, calendars]);

  const handleStartChange = (value: Date | string | null): void => {
    const d = toDate(value);
    if (!d) return;
    const duration = end.getTime() - start.getTime();
    setStart(d);
    setEnd(new Date(d.getTime() + (duration > 0 ? duration : HOUR_MS)));
  };

  const handleEndChange = (value: Date | string | null): void => {
    const d = toDate(value);
    if (d) setEnd(d);
  };

  const canSave = title.trim().length > 0 && end.getTime() > start.getTime() && !saving;

  const save = async (): Promise<void> => {
    const invalid = attendees.filter((a) => !EMAIL_RE.test(a.trim()));
    if (invalid.length > 0) {
      notifications.show({
        color: 'red',
        title: 'Invalid guest address',
        message: invalid.join(', '),
      });
      return;
    }
    const guestList: Address[] = attendees.map((email) => ({ email: email.trim() }));
    const payload: Omit<CalendarEvent, 'id'> = {
      calendarId,
      accountId: accountByCalendar.get(calendarId) ?? 'local',
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      start: start.getTime(),
      end: end.getTime(),
      allDay,
      status: event?.status ?? 'confirmed',
      organizer: event?.organizer,
      attendees: guestList.length > 0 ? guestList : undefined,
      reminders: reminders.length > 0 ? reminders.map(Number) : undefined,
      recurrenceRule: event?.recurrenceRule,
      linkedMessageId: event?.linkedMessageId,
      linkedTaskId: event?.linkedTaskId,
      snoozedUntil: event?.snoozedUntil,
    };
    setSaving(true);
    try {
      const saved =
        isEdit && event
          ? await getApi().calendar.updateEvent({ ...payload, id: event.id })
          : await getApi().calendar.createEvent(payload);
      notifications.show({
        title: isEdit ? 'Event updated' : 'Event created',
        message:
          guestList.length > 0
            ? `${saved.title} - invites sent to ${guestList.length} guest${guestList.length > 1 ? 's' : ''}`
            : saved.title,
      });
      onSaved(saved, isEdit ? 'update' : 'create');
      onClose();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: isEdit ? 'Could not update event' : 'Could not create event',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? 'Edit event' : 'New event'} size="lg">
      <Stack gap="sm">
        <TextInput
          label="Title"
          placeholder="Add a title"
          required
          data-autofocus
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />

        <Switch
          label="All day"
          checked={allDay}
          onChange={(e) => setAllDay(e.currentTarget.checked)}
        />

        <Group grow align="flex-start">
          {allDay ? (
            <>
              <DatePickerInput label="Start" value={start} onChange={handleStartChange} />
              <DatePickerInput label="End" value={end} onChange={handleEndChange} />
            </>
          ) : (
            <>
              <DateTimePicker label="Start" value={start} onChange={handleStartChange} />
              <DateTimePicker
                label="End"
                value={end}
                onChange={handleEndChange}
                error={end.getTime() <= start.getTime() ? 'End must be after start' : undefined}
              />
            </>
          )}
        </Group>

        <TextInput
          label="Location"
          placeholder="Add a location"
          value={location}
          onChange={(e) => setLocation(e.currentTarget.value)}
        />

        <TagsInput
          label="Guests"
          placeholder="Add guest email and press Enter"
          description="Guests receive a calendar invitation from your connected account."
          value={attendees}
          onChange={setAttendees}
          splitChars={[',', ' ', ';']}
          clearable
        />

        <MultiSelect
          label="Reminders"
          placeholder="Add a reminder"
          data={REMINDER_OPTIONS}
          value={reminders}
          onChange={setReminders}
          clearable
        />

        <Select
          label="Calendar"
          data={calendarOptions}
          value={calendarId}
          onChange={(v) => v && setCalendarId(v)}
          allowDeselect={false}
        />

        <Textarea
          label="Description"
          placeholder="Add a description"
          autosize
          minRows={2}
          maxRows={6}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
        />

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!canSave}>
            {isEdit ? 'Save changes' : 'Create event'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function calendarLabel(c: Calendar): string {
  return c.primary ? `${c.name} (primary)` : c.name;
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function roundUpHour(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  x.setHours(x.getHours() + 1);
  return x;
}
