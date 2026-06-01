import type {
  Account,
  AddAccountInput,
  AppSettings,
  Calendar,
  CalendarEvent,
  ChatConversation,
  ChatMessage,
  CuratedModelInfo,
  Draft,
  Folder,
  InstalledModel,
  ListMessagesInput,
  ListThreadsInput,
  LocalAiStatus,
  Message,
  MessageHeader,
  MessageThread,
  ModelPullProgress,
  MoveResult,
  MutedSender,
  NlSearchResult,
  ScheduledJob,
  Suggestion,
  SuggestionStatus,
  Task,
  TaskList,
  UnsubscribeSuggestion,
} from '@gingermail/core';

type Listener<T> = (data: T) => void;
type Unsubscribe = () => void;
export type Platform = 'darwin' | 'win32' | 'linux' | 'aix' | 'freebsd' | 'openbsd' | 'sunos' | 'cygwin' | 'netbsd';

/**
 * Renderer view of the IPC contract that the Electron preload script exposes
 * on `window.gingermail`. The implementation lives in `apps/main/src/preload.ts`;
 * this interface is duplicated here so the renderer doesn't have to cross
 * tsconfig project boundaries to type-check it.
 */
export interface Api {
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<Platform>;
    getAccentColor: () => Promise<string>;
    onThemeChanged: (cb: Listener<'light' | 'dark'>) => Unsubscribe;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
  accounts: {
    list: () => Promise<Account[]>;
    add: (input: AddAccountInput) => Promise<Account>;
    remove: (id: string) => Promise<void>;
    test: (input: AddAccountInput) => Promise<{ ok: boolean; error?: string }>;
    beginOAuth: (kind: 'gmail' | 'microsoft') => Promise<Account>;
  };
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
    refreshAll: () => Promise<void>;
    onSync: (cb: Listener<unknown>) => Unsubscribe;
    archive: (input: { id: string }) => Promise<MoveResult>;
    trash: (input: { id: string }) => Promise<MoveResult>;
    move: (input: { id: string; folderId: string }) => Promise<MoveResult>;
    markRead: (input: { id: string; read: boolean }) => Promise<void>;
    markSpam: (input: { id: string }) => Promise<MoveResult>;
    reply: (input: { id: string; all: boolean }) => Promise<Draft>;
    forward: (input: { id: string }) => Promise<Draft>;
    print: (input: { id: string }) => Promise<void>;
  };
  calendar: {
    listCalendars: () => Promise<Calendar[]>;
    listEvents: (input: { from: number; to: number; calendarIds?: string[] }) => Promise<CalendarEvent[]>;
    createEvent: (event: Omit<CalendarEvent, 'id'>) => Promise<CalendarEvent>;
    updateEvent: (event: CalendarEvent) => Promise<CalendarEvent>;
    deleteEvent: (id: string) => Promise<void>;
    importIcs: () => Promise<CalendarEvent[]>;
  };
  tasks: {
    listLists: () => Promise<TaskList[]>;
    listTasks: (listId?: string) => Promise<Task[]>;
    createTask: (task: Omit<Task, 'id' | 'position'>) => Promise<Task>;
    updateTask: (task: Task) => Promise<Task>;
    deleteTask: (id: string) => Promise<void>;
    complete: (id: string) => Promise<Task>;
    reopen: (id: string) => Promise<Task>;
  };
  ai: {
    summarizeThread: (threadId: string) => Promise<{ summary: string; actionItems: string[] }>;
    draftReply: (input: { threadId: string; tone?: string; intent?: string }) => Promise<string>;
    prioritizeInbox: () => Promise<void>;
    extractActionItems: (input: { messageId?: string; threadId?: string }) => Promise<Task[]>;
    nlSearch: (query: string) => Promise<NlSearchResult>;
    testConnection: () => Promise<{ ok: boolean; error?: string; model?: string }>;
    localStatus: () => Promise<LocalAiStatus>;
    listAvailableModels: () => Promise<CuratedModelInfo[]>;
    listInstalledModels: () => Promise<InstalledModel[]>;
    pullModel: (input: { name: string }) => Promise<void>;
    deleteModel: (input: { name: string }) => Promise<void>;
    onPullProgress: (cb: Listener<ModelPullProgress>) => Unsubscribe;
    getCloudKeyStatus: () => Promise<{ configured: boolean; last4?: string }>;
    setCloudKey: (input: { key: string }) => Promise<void>;
    clearCloudKey: () => Promise<void>;
  };
  focus: {
    start: (input: { durationMin: number }) => Promise<void>;
    stop: () => Promise<void>;
    status: () => Promise<{ active: boolean; endsAt?: number }>;
    onChange: (cb: Listener<unknown>) => Unsubscribe;
  };
  scheduler: {
    listJobs: () => Promise<ScheduledJob[]>;
    cancel: (id: string) => Promise<void>;
  };
  notifications: {
    test: () => Promise<void>;
    onAction: (cb: Listener<unknown>) => Unsubscribe;
  };
  unsubscribe: {
    listSuggestions: () => Promise<UnsubscribeSuggestion[]>;
    perform: (input: { email: string; http?: string; mailto?: string; oneClick: boolean }) => Promise<{ ok: boolean; method: 'http' | 'mailto' | 'none'; error?: string }>;
    mute: (input: { email: string }) => Promise<void>;
    unmute: (input: { email: string }) => Promise<void>;
    dismiss: (input: { email: string }) => Promise<void>;
    listMuted: () => Promise<MutedSender[]>;
  };
  slack: {
    connectToken: (input: { token: string }) => Promise<Account>;
    beginOAuth: () => Promise<Account>;
    disconnect: (input: { accountId: string }) => Promise<void>;
    listWorkspaces: () => Promise<Account[]>;
    listConversations: (input?: { accountId?: string }) => Promise<ChatConversation[]>;
    listMessages: (input: { conversationId: string; limit?: number }) => Promise<ChatMessage[]>;
    send: (input: { conversationId: string; text: string }) => Promise<ChatMessage>;
    markRead: (input: { conversationId: string }) => Promise<void>;
    refresh: () => Promise<void>;
    onSync: (cb: Listener<unknown>) => Unsubscribe;
  };
  discord: {
    connectToken: (input: { token: string }) => Promise<Account>;
  };
  suggestions: {
    list: (input?: { status?: SuggestionStatus }) => Promise<Suggestion[]>;
    accept: (input: { id: string }) => Promise<{ ok: boolean; draft?: Draft }>;
    reject: (input: { id: string }) => Promise<void>;
    dismiss: (input: { id: string }) => Promise<void>;
    onChanged: (cb: Listener<void>) => Unsubscribe;
  };
}

declare global {
  interface Window {
    gingermail: Api;
  }
}

/**
 * Returns the bridged API. Outside of Electron (e.g. `vite preview` in a
 * regular browser tab), we return a mock that satisfies the type so the UI
 * still renders for design work.
 */
export function getApi(): Api {
  if (typeof window !== 'undefined' && window.gingermail) return window.gingermail;
  return createMockApi();
}

function createMockApi(): Api {
  const noListener: <T>(cb: Listener<T>) => Unsubscribe = () => () => {};
  const baseAccount: Account = {
    id: 'mock',
    kind: 'imap-smtp',
    displayName: '',
    emailAddress: '',
    createdAt: 0,
    syncIntervalSec: 300,
    enabled: true,
  };
  const baseTask: Task = {
    id: 'mock',
    listId: 'mock',
    accountId: 'mock',
    title: '',
    status: 'open',
    starred: false,
    position: 0,
  };

  return {
    app: {
      getVersion: async () => '0.0.0-mock',
      getPlatform: async () => 'darwin' as Platform,
      getAccentColor: async () => '#6366f1',
      onThemeChanged: noListener,
    },
    settings: {
      get: async () => ({
        appearance: { themeMode: 'system', density: 'cozy', fontFamily: 'system', baseFontSize: 14 },
        accessibility: { reduceMotion: 'system', highContrast: 'system', alwaysShowFocus: true, showShortcutHints: true },
        notifications: { enabled: true, batchIntervalMin: 15, dockBadge: false, perAccount: {} },
        ai: { mode: 'off' },
        focus: { defaultDurationMin: 25, pomodoroBreaksEnabled: true, breakReminderEveryMin: 45 },
      }),
      update: async (p) => ({
        appearance: { themeMode: 'system', density: 'cozy', fontFamily: 'system', baseFontSize: 14 },
        accessibility: { reduceMotion: 'system', highContrast: 'system', alwaysShowFocus: true, showShortcutHints: true },
        notifications: { enabled: true, batchIntervalMin: 15, dockBadge: false, perAccount: {} },
        ai: { mode: 'off' },
        focus: { defaultDurationMin: 25, pomodoroBreaksEnabled: true, breakReminderEveryMin: 45 },
        ...p,
      }),
    },
    accounts: {
      list: async () => [],
      add: async (input) => ({ ...baseAccount, displayName: input.displayName, emailAddress: input.emailAddress, kind: input.kind }),
      remove: async () => {},
      test: async () => ({ ok: true }),
      beginOAuth: async () => baseAccount,
    },
    mail: {
      listFolders: async () => [],
      listThreads: async () => [],
      listMessages: async () => [],
      getMessage: async () => ({
        id: 'mock',
        accountId: 'mock',
        folderId: 'mock',
        threadId: 'mock',
        uid: '0',
        from: { email: 'mock@example.com' },
        to: [],
        subject: '(mock)',
        snippet: '',
        date: Date.now(),
        unread: false,
        flagged: false,
        hasAttachments: false,
        labels: [],
        body: { text: 'Renderer is running outside of Electron.' },
        attachments: [],
      }),
      send: async () => {},
      saveDraft: async (draft) => draft,
      setFlag: async () => {},
      snooze: async () => {},
      search: async () => [],
      refreshAll: async () => {},
      onSync: noListener,
      archive: async ({ id }) => ({ ok: true, newId: id, previousFolderId: 'mock' }),
      trash: async ({ id }) => ({ ok: true, newId: id, previousFolderId: 'mock' }),
      move: async ({ id }) => ({ ok: true, newId: id, previousFolderId: 'mock' }),
      markRead: async () => {},
      markSpam: async ({ id }) => ({ ok: true, newId: id, previousFolderId: 'mock' }),
      reply: async () => ({ accountId: 'mock', to: [], subject: 'Re: (mock)' }),
      forward: async () => ({ accountId: 'mock', to: [], subject: 'Fwd: (mock)' }),
      print: async () => {},
    },
    calendar: {
      listCalendars: async () => [],
      listEvents: async () => [],
      createEvent: async (event) => ({ ...event, id: 'mock' }),
      updateEvent: async (event) => event,
      deleteEvent: async () => {},
      importIcs: async () => [],
    },
    tasks: {
      listLists: async () => [],
      listTasks: async () => [],
      createTask: async (task) => ({ ...baseTask, ...task, id: 'mock', position: 0 }),
      updateTask: async (task) => task,
      deleteTask: async () => {},
      complete: async (id) => ({ ...baseTask, id, status: 'completed' }),
      reopen: async (id) => ({ ...baseTask, id }),
    },
    ai: {
      summarizeThread: async () => ({ summary: '', actionItems: [] }),
      draftReply: async () => '',
      prioritizeInbox: async () => {},
      extractActionItems: async () => [],
      nlSearch: async (query) => ({ messages: [], usedAi: false, query }),
      testConnection: async () => ({ ok: false, error: 'Mock API - run inside Electron' }),
      localStatus: async () => ({ running: false, reusingExternal: false, binaryFound: false, uptimeMs: 0 }),
      listAvailableModels: async () => [],
      listInstalledModels: async () => [],
      pullModel: async () => {},
      deleteModel: async () => {},
      onPullProgress: noListener,
      getCloudKeyStatus: async () => ({ configured: false }),
      setCloudKey: async () => {},
      clearCloudKey: async () => {},
    },
    focus: {
      start: async () => {},
      stop: async () => {},
      status: async () => ({ active: false }),
      onChange: noListener,
    },
    scheduler: {
      listJobs: async () => [],
      cancel: async () => {},
    },
    notifications: {
      test: async () => {},
      onAction: noListener,
    },
    unsubscribe: {
      listSuggestions: async () => [],
      perform: async () => ({ ok: false, method: 'none', error: 'Mock API' }),
      mute: async () => {},
      unmute: async () => {},
      dismiss: async () => {},
      listMuted: async () => [],
    },
    slack: {
      connectToken: async () => ({ ...baseAccount, kind: 'slack', displayName: 'Mock Slack' }),
      beginOAuth: async () => ({ ...baseAccount, kind: 'slack', displayName: 'Mock Slack' }),
      disconnect: async () => {},
      listWorkspaces: async () => [],
      listConversations: async () => [],
      listMessages: async () => [],
      send: async (input) => ({
        id: `mock:${input.conversationId}:0`,
        accountId: 'mock',
        conversationId: input.conversationId,
        ts: '0',
        authorName: 'You',
        text: input.text,
        createdAt: Date.now(),
        mentionsMe: false,
      }),
      markRead: async () => {},
      refresh: async () => {},
      onSync: noListener,
    },
    discord: {
      connectToken: async () => ({ ...baseAccount, kind: 'discord', displayName: 'Mock Discord' }),
    },
    suggestions: {
      list: async () => [],
      accept: async () => ({ ok: true }),
      reject: async () => {},
      dismiss: async () => {},
      onChanged: noListener,
    },
  };
}
