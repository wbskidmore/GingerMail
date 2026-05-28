declare const google: import("googleapis").GoogleApis;
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
import type { Account, Calendar, CalendarEvent, Draft, Folder, Message, MessageHeader, Task, TaskList } from '@gingermail/core';
import type { CalendarProvider, MailProvider, Page, TaskProvider } from '../types.js';
export interface GmailTokens {
    access_token: string;
    refresh_token: string;
    expiry_date?: number;
}
/**
 * Minimum-viable Gmail / Google scope set. Adding a scope here triggers
 * a re-consent prompt for every existing user — only do it for a real
 * feature need, and document the need on the line itself.
 *
 * Conscious omissions:
 *   - `gmail.readonly`  redundant once `gmail.modify` is present (`modify`
 *                       includes read).
 *   - `gmail.compose`   redundant once `gmail.send` is present.
 *   - `gmail.labels`    not requested; we manipulate labels through
 *                       gmail.modify which already covers it.
 *   - `userinfo.profile` not requested; we only need the email address
 *                        for account labeling, which `userinfo.email`
 *                        already provides via the OAuth2 v2 endpoint.
 */
export declare const GOOGLE_SCOPES: string[];
export declare function buildGoogleAuth(clientId: string, clientSecret: string, redirectUri: string, tokens?: GmailTokens): OAuth2Client;
export declare function buildGoogleAuthUrl(client: OAuth2Client): string;
export declare class GmailMailProvider implements MailProvider {
    private readonly account;
    private readonly auth;
    private gmail;
    constructor(account: Account, auth: OAuth2Client);
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
    /**
     * Gmail uses labels for folders. Move = add the destination label and
     * remove every label that we treat as "folder-like" (INBOX, SPAM, TRASH).
     * Special case: Archive on Gmail = remove INBOX with no destination add,
     * which is what `Trash` calls and what the registry binds to E.
     */
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
    private metadataToHeader;
}
export declare class GoogleCalendarProvider implements CalendarProvider {
    private readonly account;
    private cal;
    constructor(account: Account, auth: OAuth2Client);
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
export declare class GoogleTasksProvider implements TaskProvider {
    private readonly account;
    private tasks;
    constructor(account: Account, auth: OAuth2Client);
    listLists(): Promise<TaskList[]>;
    listTasks(listId?: string): Promise<Task[]>;
    createTask(task: Omit<Task, 'id' | 'position'>): Promise<Task>;
    updateTask(task: Task): Promise<Task>;
    deleteTask(id: string): Promise<void>;
}
export {};
//# sourceMappingURL=index.d.ts.map