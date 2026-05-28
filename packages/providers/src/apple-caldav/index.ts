import { createRequire } from 'node:module';
const localRequire = createRequire(import.meta.url);
const { createDAVClient } = localRequire('tsdav') as typeof import('tsdav');
import type { Account, Calendar, CalendarEvent } from '@gingermail/core';
import type { CalendarProvider } from '../types.js';
import { ImapSmtpProvider, type ImapSmtpCredentials } from '../imap-smtp/index.js';
import { parseIcsString } from '../ics.js';

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;

export interface AppleCredentials {
  username: string;
  appSpecificPassword: string;
  emailAddress: string;
}

export class AppleMailProvider extends ImapSmtpProvider {
  constructor(account: Account, creds: AppleCredentials) {
    const imapCreds: ImapSmtpCredentials = {
      imapHost: 'imap.mail.me.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.mail.me.com',
      smtpPort: 587,
      smtpSecure: false,
      username: creds.username,
      password: creds.appSpecificPassword,
      emailAddress: creds.emailAddress,
    };
    super(account, imapCreds);
  }
}

export class AppleCalendarProvider implements CalendarProvider {
  private client: DAVClient | undefined;
  constructor(private readonly account: Account, private readonly creds: AppleCredentials) {}

  private async ensure(): Promise<DAVClient> {
    if (!this.client) {
      this.client = await createDAVClient({
        serverUrl: 'https://caldav.icloud.com',
        credentials: { username: this.creds.username, password: this.creds.appSpecificPassword },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });
    }
    if (!this.client) throw new Error('Failed to initialise iCloud CalDAV client');
    return this.client;
  }

  async listCalendars(): Promise<Calendar[]> {
    const client = await this.ensure();
    const cals = await client.fetchCalendars();
    return cals.map((c) => ({
      id: `${this.account.id}:${c.url}`,
      accountId: this.account.id,
      name: typeof c.displayName === 'string' ? c.displayName : 'iCloud Calendar',
      color: typeof c.calendarColor === 'string' ? c.calendarColor : '#fb7185',
      readonly: false,
      primary: false,
    }));
  }

  async listEvents(input: { from: number; to: number; calendarIds?: string[] }): Promise<CalendarEvent[]> {
    const client = await this.ensure();
    const cals = await client.fetchCalendars();
    const filtered = input.calendarIds
      ? cals.filter((c) => input.calendarIds!.includes(`${this.account.id}:${c.url}`))
      : cals;
    const out: CalendarEvent[] = [];
    for (const c of filtered) {
      const objs = await client.fetchCalendarObjects({
        calendar: c,
        timeRange: { start: new Date(input.from).toISOString(), end: new Date(input.to).toISOString() },
      });
      for (const o of objs) {
        if (!o.data) continue;
        const parsed = parseIcsString(typeof o.data === 'string' ? o.data : o.data.toString());
        for (const ev of parsed) {
          out.push({
            ...ev,
            id: `${this.account.id}:${c.url}:${o.url}:${ev.id}`,
            calendarId: `${this.account.id}:${c.url}`,
            accountId: this.account.id,
          });
        }
      }
    }
    return out;
  }

  async createEvent(_event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    throw new Error('iCloud event creation requires an ICS PUT - implement in v2');
  }

  async updateEvent(_event: CalendarEvent): Promise<CalendarEvent> {
    throw new Error('iCloud event update requires an ICS PUT - implement in v2');
  }

  async deleteEvent(_id: string): Promise<void> {
    throw new Error('iCloud event delete requires a DAV DELETE - implement in v2');
  }
}
