import type { Account, Calendar, CalendarEvent, Draft, Folder, Message, MessageHeader, Task, TaskList } from '@gingermail/core';
export interface MailEvent {
    kind: 'new' | 'flag-changed' | 'deleted';
    folderId: string;
    messageId: string;
}
export type Unsubscribe = () => void;
export interface Page<T> {
    items: T[];
    nextCursor?: string;
}
export interface MailProvider {
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
     * Move a single message between folders on the server. Returns the new uid
     * the destination folder assigned (most providers re-uid moved messages).
     * Implementations should be best-effort: throwing here causes the renderer
     * to display the error rather than silently losing the message.
     */
    moveMessage?(input: {
        fromFolderId: string;
        toFolderId: string;
        uid: string;
    }): Promise<{
        uid: string;
    }>;
    /**
     * Report this message as spam/junk where the provider has a dedicated
     * "report spam" API (Gmail, Microsoft Graph). Implementations that don't
     * support reporting can omit this — callers will fall back to
     * `moveMessage` into the account's Spam folder.
     */
    reportSpam?(input: {
        folderId: string;
        uid: string;
    }): Promise<void>;
    search(query: string): Promise<MessageHeader[]>;
    watch?(folderId: string, cb: (evt: MailEvent) => void): Unsubscribe;
    close(): Promise<void>;
}
export interface CalendarProvider {
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
export interface TaskProvider {
    listLists(): Promise<TaskList[]>;
    listTasks(listId?: string): Promise<Task[]>;
    createTask(task: Omit<Task, 'id' | 'position'>): Promise<Task>;
    updateTask(task: Task): Promise<Task>;
    deleteTask(id: string): Promise<void>;
}
export interface ProviderBundle {
    account: Account;
    mail?: MailProvider;
    calendar?: CalendarProvider;
    tasks?: TaskProvider;
}
//# sourceMappingURL=types.d.ts.map