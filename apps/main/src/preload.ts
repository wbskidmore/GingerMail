import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@gingermail/core';

type Listener<T> = (data: T) => void;

const subscribe = <T>(channel: string, cb: Listener<T>): (() => void) => {
  const handler = (_evt: Electron.IpcRendererEvent, data: T): void => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion),
    getPlatform: () => ipcRenderer.invoke(IPC_CHANNELS.appGetPlatform),
    getAccentColor: () => ipcRenderer.invoke(IPC_CHANNELS.appGetAccentColor),
    onThemeChanged: (cb: Listener<'light' | 'dark'>) => subscribe(IPC_CHANNELS.appThemeChanged, cb),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (patch: unknown) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch),
  },
  accounts: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.accountsList),
    add: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.accountsAdd, input),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.accountsRemove, id),
    test: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.accountsTest, input),
    beginOAuth: (kind: 'gmail' | 'microsoft') => ipcRenderer.invoke(IPC_CHANNELS.accountsBeginOAuth, kind),
  },
  mail: {
    listFolders: (accountId: string) => ipcRenderer.invoke(IPC_CHANNELS.mailListFolders, accountId),
    listThreads: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailListThreads, input),
    listMessages: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailListMessages, input),
    getMessage: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.mailGetMessage, id),
    send: (draft: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailSend, draft),
    saveDraft: (draft: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailSaveDraft, draft),
    setFlag: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailSetFlag, input),
    snooze: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailSnooze, input),
    search: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.mailSearch, query),
    refreshAll: () => ipcRenderer.invoke(IPC_CHANNELS.mailRefreshAll),
    onSync: (cb: Listener<unknown>) => subscribe(IPC_CHANNELS.mailSyncEvent, cb),
    archive: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailArchive, input),
    trash: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailTrash, input),
    move: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailMove, input),
    markRead: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailMarkRead, input),
    markSpam: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailMarkSpam, input),
    reply: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailReply, input),
    forward: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailForward, input),
    print: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.mailPrint, input),
  },
  calendar: {
    listCalendars: () => ipcRenderer.invoke(IPC_CHANNELS.calListCalendars),
    listEvents: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.calListEvents, input),
    createEvent: (event: unknown) => ipcRenderer.invoke(IPC_CHANNELS.calCreate, event),
    updateEvent: (event: unknown) => ipcRenderer.invoke(IPC_CHANNELS.calUpdate, event),
    deleteEvent: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.calDelete, id),
    importIcs: () => ipcRenderer.invoke(IPC_CHANNELS.calImportIcs),
  },
  tasks: {
    listLists: () => ipcRenderer.invoke(IPC_CHANNELS.tasksListLists),
    listTasks: (listId?: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksList, listId),
    createTask: (task: unknown) => ipcRenderer.invoke(IPC_CHANNELS.tasksCreate, task),
    updateTask: (task: unknown) => ipcRenderer.invoke(IPC_CHANNELS.tasksUpdate, task),
    deleteTask: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksDelete, id),
    complete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksComplete, id),
    reopen: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.tasksReopen, id),
  },
  ai: {
    summarizeThread: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.aiSummarize, threadId),
    draftReply: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.aiDraftReply, input),
    prioritizeInbox: () => ipcRenderer.invoke(IPC_CHANNELS.aiPrioritize),
    extractActionItems: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.aiExtractActions, input),
    nlSearch: (q: string) => ipcRenderer.invoke(IPC_CHANNELS.aiNlSearch, q),
    testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.aiTest),
    localStatus: () => ipcRenderer.invoke(IPC_CHANNELS.aiLocalStatus),
    listAvailableModels: () => ipcRenderer.invoke(IPC_CHANNELS.aiListAvailableModels),
    listInstalledModels: () => ipcRenderer.invoke(IPC_CHANNELS.aiListInstalledModels),
    pullModel: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.aiPullModel, input),
    deleteModel: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.aiDeleteModel, input),
    onPullProgress: (cb: Listener<unknown>) => subscribe(IPC_CHANNELS.aiPullProgress, cb),
    getCloudKeyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.aiGetCloudKeyStatus),
    setCloudKey: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.aiSetCloudKey, input),
    clearCloudKey: () => ipcRenderer.invoke(IPC_CHANNELS.aiClearCloudKey),
  },
  focus: {
    start: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.focusStart, input),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.focusStop),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.focusStatus),
    onChange: (cb: Listener<unknown>) => subscribe(IPC_CHANNELS.focusChanged, cb),
  },
  scheduler: {
    listJobs: () => ipcRenderer.invoke(IPC_CHANNELS.schedulerListJobs),
    cancel: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.schedulerCancel, id),
  },
  notifications: {
    test: () => ipcRenderer.invoke(IPC_CHANNELS.notificationsTest),
    onAction: (cb: Listener<unknown>) => subscribe(IPC_CHANNELS.notificationsAction, cb),
  },
  unsubscribe: {
    listSuggestions: () => ipcRenderer.invoke(IPC_CHANNELS.unsubListSuggestions),
    perform: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.unsubPerform, input),
    mute: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.unsubMute, input),
    unmute: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.unsubUnmute, input),
    dismiss: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.unsubDismiss, input),
    listMuted: () => ipcRenderer.invoke(IPC_CHANNELS.unsubListMuted),
  },
  slack: {
    connectToken: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.slackConnectToken, input),
    beginOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.slackBeginOAuth),
    disconnect: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.slackDisconnect, input),
    listWorkspaces: () => ipcRenderer.invoke(IPC_CHANNELS.slackListWorkspaces),
    listConversations: (input?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.slackListConversations, input),
    listMessages: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.slackListMessages, input),
    send: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.slackSend, input),
    markRead: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.slackMarkRead, input),
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.slackRefresh),
    onSync: (cb: Listener<unknown>) => subscribe(IPC_CHANNELS.slackSyncEvent, cb),
  },
  discord: {
    connectToken: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.discordConnectToken, input),
  },
  suggestions: {
    list: (input?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.suggestionsList, input),
    accept: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.suggestionsAccept, input),
    reject: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.suggestionsReject, input),
    dismiss: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.suggestionsDismiss, input),
    onChanged: (cb: Listener<void>) => subscribe(IPC_CHANNELS.suggestionsChanged, cb),
  },
};

contextBridge.exposeInMainWorld('gingermail', api);

export type GingerMailApi = typeof api;
