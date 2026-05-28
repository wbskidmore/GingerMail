import ICAL from 'ical.js';
import type { CalendarEvent } from '@gingermail/core';

export function parseIcsString(ics: string): CalendarEvent[] {
  const jcal = ICAL.parse(ics);
  const comp = new ICAL.Component(jcal);
  const events = comp.getAllSubcomponents('vevent');
  return events.map((vevent, idx) => {
    const event = new ICAL.Event(vevent);
    return {
      id: event.uid ?? `ics-${idx}`,
      calendarId: 'local-ics',
      accountId: 'local',
      title: event.summary ?? '(no title)',
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      start: event.startDate.toJSDate().getTime(),
      end: event.endDate.toJSDate().getTime(),
      allDay: event.startDate.isDate,
      status: 'confirmed',
    };
  });
}

export function eventsToIcs(events: CalendarEvent[]): string {
  const cal = new ICAL.Component(['vcalendar', [], []]);
  cal.updatePropertyWithValue('version', '2.0');
  cal.updatePropertyWithValue('prodid', '-//GingerMail//EN');
  for (const e of events) {
    const vevent = new ICAL.Component('vevent');
    vevent.updatePropertyWithValue('uid', e.id);
    vevent.updatePropertyWithValue('summary', e.title);
    if (e.description) vevent.updatePropertyWithValue('description', e.description);
    if (e.location) vevent.updatePropertyWithValue('location', e.location);
    vevent.updatePropertyWithValue('dtstart', ICAL.Time.fromJSDate(new Date(e.start), false));
    vevent.updatePropertyWithValue('dtend', ICAL.Time.fromJSDate(new Date(e.end), false));
    cal.addSubcomponent(vevent);
  }
  return cal.toString();
}
