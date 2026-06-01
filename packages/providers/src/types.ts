import type {
  Account,
  Calendar,
  CalendarEvent,
  ChatConversation,
  ChatMessage,
  ChatUser,
  Draft,
  Folder,
  Message,
  MessageHeader,
  Task,
  TaskList,
} from '@gingermail/core';

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
  setFlag(input: { folderId: string; uid: string; flag: 'read' | 'unread' | 'star' | 'unstar' }): Promise<void>;
  /**
   * Move a single message between folders on the server. Returns the new uid
   * the destination folder assigned (most providers re-uid moved messages).
   * Implementations should be best-effort: throwing here causes the renderer
   * to display the error rather than silently losing the message.
   */
  moveMessage?(input: { fromFolderId: string; toFolderId: string; uid: string }): Promise<{ uid: string }>;
  /**
   * Report this message as spam/junk where the provider has a dedicated
   * "report spam" API (Gmail, Microsoft Graph). Implementations that don't
   * support reporting can omit this — callers will fall back to
   * `moveMessage` into the account's Spam folder.
   */
  reportSpam?(input: { folderId: string; uid: string }): Promise<void>;
  search(query: string): Promise<MessageHeader[]>;
  watch?(folderId: string, cb: (evt: MailEvent) => void): Unsubscribe;
  close(): Promise<void>;
}

export interface CalendarProvider {
  listCalendars(): Promise<Calendar[]>;
  listEvents(input: { from: number; to: number; calendarIds?: string[] }): Promise<CalendarEvent[]>;
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

/** Result of a successful Slack `auth.test` + workspace/user identification. */
export interface ChatIdentity {
  /** Workspace / team id (Slack `T…`). */
  teamId: string;
  teamName: string;
  /** Signed-in user id (Slack `U…`). */
  userId: string;
  userName: string;
  /** The signed-in user's email, when the token scope exposes it. */
  email?: string;
}

/**
 * A chat provider (Slack today). Mirrors the read/write split of the mail
 * provider but for conversations + messages. All network egress happens in
 * the main process; the renderer only ever sees normalised core types.
 */
export interface ChatProvider {
  /** Validate the token and return workspace/user identity. */
  authTest(): Promise<ChatIdentity>;
  /** List the user's conversations (DMs, group DMs, channels). */
  listConversations(): Promise<ChatConversation[]>;
  /** Most-recent-first messages for a conversation. */
  listMessages(conversationId: string, limit?: number): Promise<ChatMessage[]>;
  /** Post a plain-text message. Returns the created message. */
  sendMessage(conversationId: string, text: string): Promise<ChatMessage>;
  /** Mark a conversation read up to `ts` (latest when omitted). */
  markRead(conversationId: string, ts?: string): Promise<void>;
  /** Roster lookup used to resolve author names / DM partner labels. */
  listUsers(): Promise<ChatUser[]>;
  /**
   * Optional real-time push. Providers that maintain a persistent connection
   * (e.g. Discord's Gateway WebSocket) implement this to deliver messages as
   * they arrive instead of relying on the poll loop. Returns an unsubscribe
   * that tears down the connection. Poll-only providers (Slack today) omit it
   * and the sync layer falls back to interval polling.
   */
  watch?(onMessage: (message: ChatMessage) => void): Unsubscribe;
}

export interface ProviderBundle {
  account: Account;
  mail?: MailProvider;
  calendar?: CalendarProvider;
  tasks?: TaskProvider;
  chat?: ChatProvider;
}
