import type { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import type { PublicClientApplication as PublicClientApplicationType } from '@azure/msal-node';
import type { Account, Calendar, CalendarEvent, Draft, Folder, Message, MessageHeader, Task, TaskList } from '@gingermail/core';
import type { CalendarProvider, MailProvider, Page, TaskProvider } from '../types.js';
/**
 * Minimum-viable Microsoft Graph scope set. Adding a scope triggers
 * re-consent for every existing user — only do it for a real feature need
 * and document it on the line itself.
 *
 * Conscious omissions:
 *   - `Mail.Read`         redundant once `Mail.ReadWrite` is present.
 *   - `Calendars.Read`    redundant once `Calendars.ReadWrite` is present.
 *   - `Mail.ReadWrite.All` enterprise-tenant scope; never used (we only
 *                          touch the signed-in user's mailbox).
 *   - `Contacts.Read`     not requested; contact suggestions come from
 *                          per-message To/Cc/Bcc parsing instead.
 *   - `profile`           not requested; the access token already includes
 *                          username and displayName via MSAL's `account`.
 */
export declare const MICROSOFT_SCOPES: string[];
export interface MicrosoftTokens {
    homeAccountId: string;
    accessToken: string;
    refreshToken?: string;
    expiresOn?: number;
}
export declare function buildMsalApp(clientId: string, tenant?: string): PublicClientApplicationType;
export declare function authProviderFromToken(token: string): AuthenticationProvider;
export declare class MicrosoftMailProvider implements MailProvider {
    private readonly account;
    private client;
    constructor(account: Account, accessToken: string);
    listFolders(): Promise<Folder[]>;
    listMessageHeaders(folderId: string, cursor?: string, limit?: number): Promise<Page<MessageHeader>>;
    getMessage(folderId: string, uid: string): Promise<Message>;
    send(draft: Draft): Promise<void>;
    saveDraft(draft: Draft): Promise<Draft>;
    setFlag(input: {
        folderId: string;
        uid: string;
        flag: 'read' | 'unread' | 'star' | 'unstar';
    }): Promise<void>;
    moveMessage(input: {
        fromFolderId: string;
        toFolderId: string;
        uid: string;
    }): Promise<{
        uid: string;
    }>;
    reportSpam(input: {
        folderId: string;
        uid: string;
    }): Promise<void>;
    search(query: string): Promise<MessageHeader[]>;
    close(): Promise<void>;
    private toHeader;
}
export declare class MicrosoftCalendarProvider implements CalendarProvider {
    private readonly account;
    private client;
    constructor(account: Account, accessToken: string);
    listCalendars(): Promise<Calendar[]>;
    listEvents(input: {
        from: number;
        to: number;
        calendarIds?: string[];
    }): Promise<CalendarEvent[]>;
    createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent>;
    updateEvent(event: CalendarEvent): Promise<CalendarEvent>;
    deleteEvent(id: string): Promise<void>;
}
export declare class MicrosoftTasksProvider implements TaskProvider {
    private readonly account;
    private client;
    constructor(account: Account, accessToken: string);
    listLists(): Promise<TaskList[]>;
    listTasks(listId?: string): Promise<Task[]>;
    createTask(task: Omit<Task, 'id' | 'position'>): Promise<Task>;
    updateTask(task: Task): Promise<Task>;
    deleteTask(id: string): Promise<void>;
}
/** Re-export class type from msal to keep external API stable. */
export type MsalApp = ReturnType<typeof buildMsalApp>;
//# sourceMappingURL=index.d.ts.map