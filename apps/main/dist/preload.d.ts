type Listener<T> = (data: T) => void;
declare const api: {
    app: {
        getVersion: () => Promise<any>;
        getPlatform: () => Promise<any>;
        getAccentColor: () => Promise<any>;
        onThemeChanged: (cb: Listener<"light" | "dark">) => () => void;
    };
    settings: {
        get: () => Promise<any>;
        update: (patch: unknown) => Promise<any>;
    };
    accounts: {
        list: () => Promise<any>;
        add: (input: unknown) => Promise<any>;
        remove: (id: string) => Promise<any>;
        test: (input: unknown) => Promise<any>;
        beginOAuth: (kind: "gmail" | "microsoft") => Promise<any>;
    };
    mail: {
        listFolders: (accountId: string) => Promise<any>;
        listThreads: (input: unknown) => Promise<any>;
        listMessages: (input: unknown) => Promise<any>;
        getMessage: (id: string) => Promise<any>;
        send: (draft: unknown) => Promise<any>;
        saveDraft: (draft: unknown) => Promise<any>;
        setFlag: (input: unknown) => Promise<any>;
        snooze: (input: unknown) => Promise<any>;
        search: (query: string) => Promise<any>;
        refreshAll: () => Promise<any>;
        onSync: (cb: Listener<unknown>) => () => void;
        archive: (input: unknown) => Promise<any>;
        trash: (input: unknown) => Promise<any>;
        move: (input: unknown) => Promise<any>;
        markRead: (input: unknown) => Promise<any>;
        markSpam: (input: unknown) => Promise<any>;
        reply: (input: unknown) => Promise<any>;
        forward: (input: unknown) => Promise<any>;
        print: (input: unknown) => Promise<any>;
    };
    calendar: {
        listCalendars: () => Promise<any>;
        listEvents: (input: unknown) => Promise<any>;
        createEvent: (event: unknown) => Promise<any>;
        updateEvent: (event: unknown) => Promise<any>;
        deleteEvent: (id: string) => Promise<any>;
        importIcs: () => Promise<any>;
    };
    tasks: {
        listLists: () => Promise<any>;
        listTasks: (listId?: string) => Promise<any>;
        createTask: (task: unknown) => Promise<any>;
        updateTask: (task: unknown) => Promise<any>;
        deleteTask: (id: string) => Promise<any>;
        complete: (id: string) => Promise<any>;
        reopen: (id: string) => Promise<any>;
    };
    ai: {
        summarizeThread: (threadId: string) => Promise<any>;
        draftReply: (input: unknown) => Promise<any>;
        prioritizeInbox: () => Promise<any>;
        extractActionItems: (input: unknown) => Promise<any>;
        nlSearch: (q: string) => Promise<any>;
        testConnection: () => Promise<any>;
        localStatus: () => Promise<any>;
        listAvailableModels: () => Promise<any>;
        listInstalledModels: () => Promise<any>;
        pullModel: (input: unknown) => Promise<any>;
        deleteModel: (input: unknown) => Promise<any>;
        onPullProgress: (cb: Listener<unknown>) => () => void;
        getCloudKeyStatus: () => Promise<any>;
        setCloudKey: (input: unknown) => Promise<any>;
        clearCloudKey: () => Promise<any>;
    };
    focus: {
        start: (input: unknown) => Promise<any>;
        stop: () => Promise<any>;
        status: () => Promise<any>;
        onChange: (cb: Listener<unknown>) => () => void;
    };
    scheduler: {
        listJobs: () => Promise<any>;
        cancel: (id: string) => Promise<any>;
    };
    notifications: {
        test: () => Promise<any>;
        onAction: (cb: Listener<unknown>) => () => void;
    };
    unsubscribe: {
        listSuggestions: () => Promise<any>;
        perform: (input: unknown) => Promise<any>;
        mute: (input: unknown) => Promise<any>;
        unmute: (input: unknown) => Promise<any>;
        dismiss: (input: unknown) => Promise<any>;
        listMuted: () => Promise<any>;
    };
};
export type GingerMailApi = typeof api;
export {};
//# sourceMappingURL=preload.d.ts.map