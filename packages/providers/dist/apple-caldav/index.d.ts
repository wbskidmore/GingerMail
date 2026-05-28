import type { Account, Calendar, CalendarEvent } from '@gingermail/core';
import type { CalendarProvider } from '../types.js';
import { ImapSmtpProvider } from '../imap-smtp/index.js';
export interface AppleCredentials {
    username: string;
    appSpecificPassword: string;
    emailAddress: string;
}
export declare class AppleMailProvider extends ImapSmtpProvider {
    constructor(account: Account, creds: AppleCredentials);
}
export declare class AppleCalendarProvider implements CalendarProvider {
    private readonly account;
    private readonly creds;
    private client;
    constructor(account: Account, creds: AppleCredentials);
    private ensure;
    listCalendars(): Promise<Calendar[]>;
    listEvents(input: {
        from: number;
        to: number;
        calendarIds?: string[];
    }): Promise<CalendarEvent[]>;
    createEvent(_event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent>;
    updateEvent(_event: CalendarEvent): Promise<CalendarEvent>;
    deleteEvent(_id: string): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map