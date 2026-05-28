import { createRequire } from 'node:module';
const localRequire = createRequire(import.meta.url);
const { createDAVClient } = localRequire('tsdav');
import { ImapSmtpProvider } from '../imap-smtp/index.js';
import { parseIcsString } from '../ics.js';
export class AppleMailProvider extends ImapSmtpProvider {
    constructor(account, creds) {
        const imapCreds = {
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
export class AppleCalendarProvider {
    account;
    creds;
    client;
    constructor(account, creds) {
        this.account = account;
        this.creds = creds;
    }
    async ensure() {
        if (!this.client) {
            this.client = await createDAVClient({
                serverUrl: 'https://caldav.icloud.com',
                credentials: { username: this.creds.username, password: this.creds.appSpecificPassword },
                authMethod: 'Basic',
                defaultAccountType: 'caldav',
            });
        }
        if (!this.client)
            throw new Error('Failed to initialise iCloud CalDAV client');
        return this.client;
    }
    async listCalendars() {
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
    async listEvents(input) {
        const client = await this.ensure();
        const cals = await client.fetchCalendars();
        const filtered = input.calendarIds
            ? cals.filter((c) => input.calendarIds.includes(`${this.account.id}:${c.url}`))
            : cals;
        const out = [];
        for (const c of filtered) {
            const objs = await client.fetchCalendarObjects({
                calendar: c,
                timeRange: { start: new Date(input.from).toISOString(), end: new Date(input.to).toISOString() },
            });
            for (const o of objs) {
                if (!o.data)
                    continue;
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
    async createEvent(_event) {
        throw new Error('iCloud event creation requires an ICS PUT - implement in v2');
    }
    async updateEvent(_event) {
        throw new Error('iCloud event update requires an ICS PUT - implement in v2');
    }
    async deleteEvent(_id) {
        throw new Error('iCloud event delete requires a DAV DELETE - implement in v2');
    }
}
//# sourceMappingURL=index.js.map