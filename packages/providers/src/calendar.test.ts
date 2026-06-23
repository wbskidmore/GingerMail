import { describe, expect, it } from 'vitest';
import type { Account, CalendarEvent } from '@gingermail/core';
import { GoogleCalendarProvider, buildGoogleEventBody } from './gmail/index.js';
import { buildGraphEventBody } from './microsoft/index.js';

const base: Omit<CalendarEvent, 'id'> = {
  calendarId: 'acct:cal1',
  accountId: 'acct',
  title: 'Sprint sync',
  description: 'Weekly check-in',
  location: 'Room 4',
  start: Date.UTC(2026, 5, 23, 15, 0, 0),
  end: Date.UTC(2026, 5, 23, 16, 0, 0),
  allDay: false,
  status: 'confirmed',
  attendees: [{ email: 'ada@x.com', name: 'Ada' }, { email: 'bob@y.com' }],
  reminders: [10, 30],
};

describe('buildGoogleEventBody', () => {
  it('maps attendees and reminder overrides for invites', () => {
    const body = buildGoogleEventBody(base);
    expect(body.attendees).toEqual([
      { email: 'ada@x.com', displayName: 'Ada' },
      { email: 'bob@y.com', displayName: undefined },
    ]);
    expect(body.reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'popup', minutes: 30 },
      ],
    });
    expect(body.start?.dateTime).toBeDefined();
    expect(body.start?.date).toBeUndefined();
  });

  it('omits attendees/reminders when absent and uses date for all-day', () => {
    const body = buildGoogleEventBody({
      ...base,
      attendees: undefined,
      reminders: undefined,
      allDay: true,
    });
    expect(body.attendees).toBeUndefined();
    expect(body.reminders).toBeUndefined();
    expect(body.start?.date).toBeDefined();
    expect(body.start?.dateTime).toBeUndefined();
  });
});

describe('GoogleCalendarProvider.createEvent', () => {
  it('passes sendUpdates="all" when there are attendees', async () => {
    const provider = new GoogleCalendarProvider({ id: 'acct' } as Account, {} as never);
    const calls: Array<Record<string, unknown>> = [];
    // Replace the network client with an in-memory stub.
    (provider as unknown as { cal: unknown }).cal = {
      events: {
        insert: async (args: { requestBody: { start: unknown; end: unknown } } & Record<string, unknown>) => {
          calls.push(args);
          return {
            data: {
              id: 'evt1',
              summary: 'Sprint sync',
              start: args.requestBody.start,
              end: args.requestBody.end,
            },
          };
        },
      },
    };
    await provider.createEvent(base);
    expect(calls[0]!.sendUpdates).toBe('all');

    calls.length = 0;
    await provider.createEvent({ ...base, attendees: undefined });
    expect(calls[0]!.sendUpdates).toBe('none');
  });
});

describe('buildGraphEventBody', () => {
  const expectedZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  })();

  it('maps attendees, a reminder offset, and a local (non-hardcoded-UTC) time zone', () => {
    const body = buildGraphEventBody(base) as {
      attendees: unknown;
      reminderMinutesBeforeStart: number;
      isReminderOn: boolean;
      start: { dateTime: string; timeZone: string };
    };
    expect(body.attendees).toEqual([
      { emailAddress: { address: 'ada@x.com', name: 'Ada' }, type: 'required' },
      { emailAddress: { address: 'bob@y.com', name: undefined }, type: 'required' },
    ]);
    expect(body.reminderMinutesBeforeStart).toBe(10); // earliest of [10, 30]
    expect(body.isReminderOn).toBe(true);
    expect(body.start.timeZone).toBe(expectedZone);
    // Graph wants a local wall-clock string, never an instant with a Z suffix.
    expect(body.start.dateTime).not.toMatch(/Z$/);
  });

  it('turns the reminder off when none are set', () => {
    const body = buildGraphEventBody({ ...base, reminders: [] }) as {
      isReminderOn?: boolean;
      reminderMinutesBeforeStart?: number;
    };
    expect(body.reminderMinutesBeforeStart).toBeUndefined();
  });
});
