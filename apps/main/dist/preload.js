import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@gingermail/core';
const subscribe = (channel, cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
};
const api = {
    app: {
        getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion),
        getPlatform: () => ipcRenderer.invoke(IPC_CHANNELS.appGetPlatform),
        getAccentColor: () => ipcRenderer.invoke(IPC_CHANNELS.appGetAccentColor),
        onThemeChanged: (cb) => subscribe(IPC_CHANNELS.appThemeChanged, cb),
    },
    settings: {
        get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
        update: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch),
    },
    accounts: {
        list: () => ipcRenderer.invoke(IPC_CHANNELS.accountsList),
        add: (input) => ipcRenderer.invoke(IPC_CHANNELS.accountsAdd, input),
        remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.accountsRemove, id),
        test: (input) => ipcRenderer.invoke(IPC_CHANNELS.accountsTest, input),
        beginOAuth: (kind) => ipcRenderer.invoke(IPC_CHANNELS.accountsBeginOAuth, kind),
    },
    mail: {
        listFolders: (accountId) => ipcRenderer.invoke(IPC_CHANNELS.mailListFolders, accountId),
        listThreads: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailListThreads, input),
        listMessages: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailListMessages, input),
        getMessage: (id) => ipcRenderer.invoke(IPC_CHANNELS.mailGetMessage, id),
        send: (draft) => ipcRenderer.invoke(IPC_CHANNELS.mailSend, draft),
        saveDraft: (draft) => ipcRenderer.invoke(IPC_CHANNELS.mailSaveDraft, draft),
        setFlag: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailSetFlag, input),
        snooze: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailSnooze, input),
        search: (query) => ipcRenderer.invoke(IPC_CHANNELS.mailSearch, query),
        refreshAll: () => ipcRenderer.invoke(IPC_CHANNELS.mailRefreshAll),
        onSync: (cb) => subscribe(IPC_CHANNELS.mailSyncEvent, cb),
        archive: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailArchive, input),
        trash: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailTrash, input),
        move: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailMove, input),
        markRead: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailMarkRead, input),
        markSpam: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailMarkSpam, input),
        reply: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailReply, input),
        forward: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailForward, input),
        print: (input) => ipcRenderer.invoke(IPC_CHANNELS.mailPrint, input),
    },
    calendar: {
        listCalendars: () => ipcRenderer.invoke(IPC_CHANNELS.calListCalendars),
        listEvents: (input) => ipcRenderer.invoke(IPC_CHANNELS.calListEvents, input),
        createEvent: (event) => ipcRenderer.invoke(IPC_CHANNELS.calCreate, event),
        updateEvent: (event) => ipcRenderer.invoke(IPC_CHANNELS.calUpdate, event),
        deleteEvent: (id) => ipcRenderer.invoke(IPC_CHANNELS.calDelete, id),
        importIcs: () => ipcRenderer.invoke(IPC_CHANNELS.calImportIcs),
    },
    tasks: {
        listLists: () => ipcRenderer.invoke(IPC_CHANNELS.tasksListLists),
        listTasks: (listId) => ipcRenderer.invoke(IPC_CHANNELS.tasksList, listId),
        createTask: (task) => ipcRenderer.invoke(IPC_CHANNELS.tasksCreate, task),
        updateTask: (task) => ipcRenderer.invoke(IPC_CHANNELS.tasksUpdate, task),
        deleteTask: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksDelete, id),
        complete: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksComplete, id),
        reopen: (id) => ipcRenderer.invoke(IPC_CHANNELS.tasksReopen, id),
    },
    ai: {
        summarizeThread: (threadId) => ipcRenderer.invoke(IPC_CHANNELS.aiSummarize, threadId),
        draftReply: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiDraftReply, input),
        prioritizeInbox: () => ipcRenderer.invoke(IPC_CHANNELS.aiPrioritize),
        extractActionItems: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiExtractActions, input),
        nlSearch: (q) => ipcRenderer.invoke(IPC_CHANNELS.aiNlSearch, q),
        testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.aiTest),
        localStatus: () => ipcRenderer.invoke(IPC_CHANNELS.aiLocalStatus),
        listAvailableModels: () => ipcRenderer.invoke(IPC_CHANNELS.aiListAvailableModels),
        listInstalledModels: () => ipcRenderer.invoke(IPC_CHANNELS.aiListInstalledModels),
        pullModel: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiPullModel, input),
        deleteModel: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiDeleteModel, input),
        onPullProgress: (cb) => subscribe(IPC_CHANNELS.aiPullProgress, cb),
        getCloudKeyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.aiGetCloudKeyStatus),
        setCloudKey: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiSetCloudKey, input),
        clearCloudKey: () => ipcRenderer.invoke(IPC_CHANNELS.aiClearCloudKey),
    },
    focus: {
        start: (input) => ipcRenderer.invoke(IPC_CHANNELS.focusStart, input),
        stop: () => ipcRenderer.invoke(IPC_CHANNELS.focusStop),
        status: () => ipcRenderer.invoke(IPC_CHANNELS.focusStatus),
        onChange: (cb) => subscribe(IPC_CHANNELS.focusChanged, cb),
    },
    scheduler: {
        listJobs: () => ipcRenderer.invoke(IPC_CHANNELS.schedulerListJobs),
        cancel: (id) => ipcRenderer.invoke(IPC_CHANNELS.schedulerCancel, id),
    },
    notifications: {
        test: () => ipcRenderer.invoke(IPC_CHANNELS.notificationsTest),
        onAction: (cb) => subscribe(IPC_CHANNELS.notificationsAction, cb),
    },
    unsubscribe: {
        listSuggestions: () => ipcRenderer.invoke(IPC_CHANNELS.unsubListSuggestions),
        perform: (input) => ipcRenderer.invoke(IPC_CHANNELS.unsubPerform, input),
        mute: (input) => ipcRenderer.invoke(IPC_CHANNELS.unsubMute, input),
        unmute: (input) => ipcRenderer.invoke(IPC_CHANNELS.unsubUnmute, input),
        dismiss: (input) => ipcRenderer.invoke(IPC_CHANNELS.unsubDismiss, input),
        listMuted: () => ipcRenderer.invoke(IPC_CHANNELS.unsubListMuted),
    },
};
contextBridge.exposeInMainWorld('gingermail', api);
//# sourceMappingURL=preload.js.map