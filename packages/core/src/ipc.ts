import type {
  Account,
  AppSettings,
  Calendar,
  CalendarEvent,
  ChatConversation,
  ChatMessage,
  Draft,
  Folder,
  Message,
  MessageHeader,
  MessageThread,
  MutedSender,
  ProviderKind,
  ScheduledJob,
  Task,
  TaskList,
  UnsubscribeSuggestion,
} from './models.js';

/**
 * Result of a natural-language search. `usedAi` tells the UI whether the
 * spec actually came from the AI (vs a plain-FTS fallback), and the optional
 * `explanation` + `model` let the UI surface "GingerMail interpreted: …".
 */
export interface NlSearchResult {
  messages: MessageHeader[];
  usedAi: boolean;
  query: string;
  explanation?: string;
  model?: string;
}

/**
 * Return value of any "move" style mail action (archive, trash, move, spam).
 * `previousFolderId` lets the renderer offer an Undo that restores the
 * message to where it was, and `newId` is the message's id after the move
 * (provider id format is `account:folder:uid`, so a move changes the id).
 */
export interface MoveResult {
  ok: boolean;
  newId: string;
  previousFolderId: string;
}

/**
 * Current state of the bundled Ollama sidecar. The renderer's Local AI
 * settings card and first-launch wizard subscribe via `ai.localStatus`.
 *  - `running`         : an Ollama server is responding on the expected port
 *  - `reusingExternal` : we found one already running and didn't spawn ours
 *  - `binaryFound`     : the bundled binary exists on disk
 *  - `lastError`       : human-readable; surfaces in the Settings UI when set
 */
export interface LocalAiStatus {
  running: boolean;
  reusingExternal: boolean;
  binaryFound: boolean;
  uptimeMs: number;
  lastError?: string;
}

/** A curated entry in the first-launch wizard's model list. */
export interface CuratedModelInfo {
  id: string;
  displayName: string;
  sizeGB: number;
  ramGB: number;
  description: string;
  recommended?: boolean;
  starter?: boolean;
}

export interface InstalledModel {
  name: string;
  sizeBytes: number;
  modifiedAt: number;
}

export interface ModelPullProgress {
  name: string;
  status: string;
  completed?: number;
  total?: number;
  /** Set when the pull terminates; UI flips state accordingly. */
  done?: boolean;
  error?: string;
}

/**
 * Typed IPC contract shared between the Electron main process and renderer.
 * Renderer code only ever talks to main via these channels (exposed through the preload bridge).
 */
export interface IpcApi {
  // Lifecycle / theme
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<NodeJS.Platform>;
    getAccentColor: () => Promise<string>;
    onThemeChanged: (cb: (mode: 'light' | 'dark') => void) => () => void;
  };

  // Settings
  settings: {
    get: () => Promise<AppSettings>;
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };

  // Accounts
  accounts: {
    list: () => Promise<Account[]>;
    add: (input: AddAccountInput) => Promise<Account>;
    remove: (id: string) => Promise<void>;
    test: (input: AddAccountInput) => Promise<{ ok: boolean; error?: string }>;
    beginOAuth: (kind: 'gmail' | 'microsoft') => Promise<Account>;
  };

  // Mail
  mail: {
    listFolders: (accountId: string) => Promise<Folder[]>;
    listThreads: (input: ListThreadsInput) => Promise<MessageThread[]>;
    listMessages: (input: ListMessagesInput) => Promise<MessageHeader[]>;
    getMessage: (id: string) => Promise<Message>;
    send: (draft: Draft) => Promise<void>;
    saveDraft: (draft: Draft) => Promise<Draft>;
    setFlag: (input: { id: string; flag: 'read' | 'unread' | 'star' | 'unstar' }) => Promise<void>;
    snooze: (input: { id: string; until: number }) => Promise<void>;
    search: (query: string) => Promise<MessageHeader[]>;
    onSync: (cb: (evt: SyncEvent) => void) => () => void;
    refreshAll: () => Promise<void>;
    // ---- Mail actions ----
    /** Move to the account's archive folder. Returns the previous folder id for Undo. */
    archive: (input: { id: string }) => Promise<MoveResult>;
    /** Move to the account's trash. Returns the previous folder id for Undo. */
    trash: (input: { id: string }) => Promise<MoveResult>;
    /** Generic move to any folder. */
    move: (input: { id: string; folderId: string }) => Promise<MoveResult>;
    /** Mark a single message as read or unread. */
    markRead: (input: { id: string; read: boolean }) => Promise<void>;
    /** Report as spam (where supported) and move to spam/junk folder. */
    markSpam: (input: { id: string }) => Promise<MoveResult>;
    /** Build a Draft pre-populated as a reply (set `all` for Reply-All). */
    reply: (input: { id: string; all: boolean }) => Promise<Draft>;
    /** Build a Draft pre-populated as a forward (quoted body + attachments). */
    forward: (input: { id: string }) => Promise<Draft>;
    /** Print the currently selected message via the OS print dialog. */
    print: (input: { id: string }) => Promise<void>;
  };

  // Calendar
  calendar: {
    listCalendars: () => Promise<Calendar[]>;
    listEvents: (input: { from: number; to: number; calendarIds?: string[] }) => Promise<CalendarEvent[]>;
    createEvent: (event: Omit<CalendarEvent, 'id'>) => Promise<CalendarEvent>;
    updateEvent: (event: CalendarEvent) => Promise<CalendarEvent>;
    deleteEvent: (id: string) => Promise<void>;
    /**
     * Open the native file picker and import the chosen .ics into the local
     * calendar. The renderer is intentionally NOT allowed to pass a path
     * directly — that would let any compromised renderer read arbitrary
     * files off the user's disk.
     */
    importIcs: () => Promise<CalendarEvent[]>;
  };

  // Tasks
  tasks: {
    listLists: () => Promise<TaskList[]>;
    listTasks: (listId?: string) => Promise<Task[]>;
    createTask: (task: Omit<Task, 'id' | 'position'>) => Promise<Task>;
    updateTask: (task: Task) => Promise<Task>;
    deleteTask: (id: string) => Promise<void>;
    complete: (id: string) => Promise<Task>;
    reopen: (id: string) => Promise<Task>;
  };

  // AI
  ai: {
    summarizeThread: (threadId: string) => Promise<{ summary: string; actionItems: string[] }>;
    draftReply: (input: { threadId: string; tone?: string; intent?: string }) => Promise<string>;
    prioritizeInbox: () => Promise<void>;
    extractActionItems: (input: { messageId?: string; threadId?: string }) => Promise<Task[]>;
    nlSearch: (query: string) => Promise<NlSearchResult>;
    testConnection: () => Promise<{ ok: boolean; error?: string; model?: string }>;
    // ---- Local AI / Ollama sidecar ----
    localStatus: () => Promise<LocalAiStatus>;
    listAvailableModels: () => Promise<CuratedModelInfo[]>;
    listInstalledModels: () => Promise<InstalledModel[]>;
    pullModel: (input: { name: string }) => Promise<void>;
    deleteModel: (input: { name: string }) => Promise<void>;
    /** Renderer subscribes to model-pull progress events. */
    onPullProgress: (cb: (evt: ModelPullProgress) => void) => () => void;
    // ---- Cloud AI key vault ----
    /**
     * Returns whether a cloud AI key is configured, plus the last 4 chars of
     * the stored key for "Replace key (****1234)" UI affordance. Never
     * returns the full key to the renderer.
     */
    getCloudKeyStatus: () => Promise<{ configured: boolean; last4?: string }>;
    /** Persist a new cloud AI key into the OS keychain via TokenVault. */
    setCloudKey: (input: { key: string }) => Promise<void>;
    /** Remove the stored cloud AI key. */
    clearCloudKey: () => Promise<void>;
  };

  // Focus mode
  focus: {
    start: (input: { durationMin: number }) => Promise<void>;
    stop: () => Promise<void>;
    status: () => Promise<{ active: boolean; endsAt?: number }>;
    onChange: (cb: (state: { active: boolean; endsAt?: number }) => void) => () => void;
  };

  // Notifications + scheduler
  scheduler: {
    listJobs: () => Promise<ScheduledJob[]>;
    cancel: (jobId: string) => Promise<void>;
  };

  notifications: {
    test: () => Promise<void>;
    onAction: (cb: (payload: { jobId: string; action: string }) => void) => () => void;
  };

  // ---- Unsubscribe / mute ----
  unsubscribe: {
    /** Recompute suggestions (heuristic + optional AI assist). */
    listSuggestions: () => Promise<UnsubscribeSuggestion[]>;
    /** Execute the unsubscribe (one-click HTTPS POST or mailto compose). */
    perform: (input: { email: string; http?: string; mailto?: string; oneClick: boolean }) => Promise<{ ok: boolean; method: 'http' | 'mailto' | 'none'; error?: string }>;
    /** Mute (auto-trash) future mail from a sender locally. */
    mute: (input: { email: string }) => Promise<void>;
    unmute: (input: { email: string }) => Promise<void>;
    /** Mark a suggestion dismissed without taking action. */
    dismiss: (input: { email: string }) => Promise<void>;
    /** List muted senders for the Privacy settings card. */
    listMuted: () => Promise<MutedSender[]>;
  };

  // ---- Slack / chat ----
  slack: {
    /**
     * Connect a workspace by pasting a Slack token (xoxp-/xoxb-/xoxc-…).
     * Runs `auth.test`, persists the token in the OS keychain, and creates a
     * `kind:'slack'` account. Returns the created account.
     */
    connectToken: (input: { token: string }) => Promise<Account>;
    /** Connect via the BYO Slack OAuth app (loopback redirect). */
    beginOAuth: () => Promise<Account>;
    /** Remove a connected workspace (token + cached data). */
    disconnect: (input: { accountId: string }) => Promise<void>;
    /** Connected workspaces (subset of accounts where kind === 'slack'). */
    listWorkspaces: () => Promise<Account[]>;
    /** Cached conversations for a workspace (or all when accountId omitted). */
    listConversations: (input?: { accountId?: string }) => Promise<ChatConversation[]>;
    /** Most recent messages for a conversation. */
    listMessages: (input: { conversationId: string; limit?: number }) => Promise<ChatMessage[]>;
    /** Post a message to a conversation. */
    send: (input: { conversationId: string; text: string }) => Promise<ChatMessage>;
    /** Mark a conversation read up to its latest message. */
    markRead: (input: { conversationId: string }) => Promise<void>;
    /** Force a poll of all workspaces now. */
    refresh: () => Promise<void>;
    /** Subscribe to background sync events (new messages / unread changes). */
    onSync: (cb: (evt: ChatSyncEvent) => void) => () => void;
  };
}

export type ChatSyncEvent =
  | { type: 'started'; accountId: string }
  | { type: 'finished'; accountId: string }
  | { type: 'conversations-updated'; accountId: string }
  | { type: 'new-message'; accountId: string; conversationId: string; mentionsMe: boolean }
  | { type: 'error'; accountId: string; error: string };

export interface AddAccountInput {
  kind: ProviderKind;
  displayName: string;
  emailAddress: string;
  password?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  pop3Host?: string;
  pop3Port?: number;
  pop3Secure?: boolean;
  username?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
}

export interface ListThreadsInput {
  accountId?: string;
  folderId?: string;
  unifiedInbox?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListMessagesInput {
  accountId?: string;
  folderId?: string;
  threadId?: string;
  limit?: number;
  offset?: number;
}

export type SyncEvent =
  | { type: 'started'; accountId: string }
  | { type: 'progress'; accountId: string; folderId: string; count: number }
  | { type: 'finished'; accountId: string }
  | { type: 'new-message'; accountId: string; folderId: string; messageId: string }
  | { type: 'error'; accountId: string; error: string };

export const IPC_CHANNELS = {
  // app
  appGetVersion: 'app:getVersion',
  appGetPlatform: 'app:getPlatform',
  appGetAccentColor: 'app:getAccentColor',
  appThemeChanged: 'app:themeChanged',

  // settings
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  // accounts
  accountsList: 'accounts:list',
  accountsAdd: 'accounts:add',
  accountsRemove: 'accounts:remove',
  accountsTest: 'accounts:test',
  accountsBeginOAuth: 'accounts:beginOAuth',

  // mail
  mailListFolders: 'mail:listFolders',
  mailListThreads: 'mail:listThreads',
  mailListMessages: 'mail:listMessages',
  mailGetMessage: 'mail:getMessage',
  mailSend: 'mail:send',
  mailSaveDraft: 'mail:saveDraft',
  mailSetFlag: 'mail:setFlag',
  mailSnooze: 'mail:snooze',
  mailSearch: 'mail:search',
  mailRefreshAll: 'mail:refreshAll',
  mailSyncEvent: 'mail:syncEvent',
  mailArchive: 'mail:archive',
  mailTrash: 'mail:trash',
  mailMove: 'mail:move',
  mailMarkRead: 'mail:markRead',
  mailMarkSpam: 'mail:markSpam',
  mailReply: 'mail:reply',
  mailForward: 'mail:forward',
  mailPrint: 'mail:print',

  // calendar
  calListCalendars: 'cal:listCalendars',
  calListEvents: 'cal:listEvents',
  calCreate: 'cal:create',
  calUpdate: 'cal:update',
  calDelete: 'cal:delete',
  calImportIcs: 'cal:importIcs',

  // tasks
  tasksListLists: 'tasks:listLists',
  tasksList: 'tasks:list',
  tasksCreate: 'tasks:create',
  tasksUpdate: 'tasks:update',
  tasksDelete: 'tasks:delete',
  tasksComplete: 'tasks:complete',
  tasksReopen: 'tasks:reopen',

  // ai
  aiSummarize: 'ai:summarizeThread',
  aiDraftReply: 'ai:draftReply',
  aiPrioritize: 'ai:prioritizeInbox',
  aiExtractActions: 'ai:extractActionItems',
  aiNlSearch: 'ai:nlSearch',
  aiTest: 'ai:testConnection',
  aiLocalStatus: 'ai:localStatus',
  aiListAvailableModels: 'ai:listAvailableModels',
  aiListInstalledModels: 'ai:listInstalledModels',
  aiPullModel: 'ai:pullModel',
  aiDeleteModel: 'ai:deleteModel',
  aiPullProgress: 'ai:pullProgress',
  aiGetCloudKeyStatus: 'ai:getCloudKeyStatus',
  aiSetCloudKey: 'ai:setCloudKey',
  aiClearCloudKey: 'ai:clearCloudKey',

  // focus
  focusStart: 'focus:start',
  focusStop: 'focus:stop',
  focusStatus: 'focus:status',
  focusChanged: 'focus:changed',

  // scheduler
  schedulerListJobs: 'scheduler:listJobs',
  schedulerCancel: 'scheduler:cancel',

  // notifications
  notificationsTest: 'notifications:test',
  notificationsAction: 'notifications:action',

  // unsubscribe
  unsubListSuggestions: 'unsub:listSuggestions',
  unsubPerform: 'unsub:perform',
  unsubMute: 'unsub:mute',
  unsubUnmute: 'unsub:unmute',
  unsubDismiss: 'unsub:dismiss',
  unsubListMuted: 'unsub:listMuted',

  // updates
  updatesStatus: 'updates:status',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',

  // slack / chat
  slackConnectToken: 'slack:connectToken',
  slackBeginOAuth: 'slack:beginOAuth',
  slackDisconnect: 'slack:disconnect',
  slackListWorkspaces: 'slack:listWorkspaces',
  slackListConversations: 'slack:listConversations',
  slackListMessages: 'slack:listMessages',
  slackSend: 'slack:send',
  slackMarkRead: 'slack:markRead',
  slackRefresh: 'slack:refresh',
  slackSyncEvent: 'slack:syncEvent',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
