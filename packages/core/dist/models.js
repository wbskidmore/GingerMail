export const DEFAULT_MAIL_TOOLBAR = {
    visible: ['reply', 'replyAll', 'forward', 'archive', 'trash', 'flag', 'snooze', 'aiSummarise'],
    overflow: ['move', 'markUnread', 'spam', 'print'],
};
export const defaultAccessibilitySettings = {
    reduceMotion: 'system',
    highContrast: 'system',
    alwaysShowFocus: true,
    showShortcutHints: true,
};
/**
 * Allowed AI egress hostnames per vendor. Production main process
 * enforces these via a session.webRequest.onBeforeRequest filter on
 * the AI process partition. Adding a host means the user can pick
 * that vendor; removing one immediately blocks new requests.
 *
 * Order matters for "is this URL allowed?" checks: longer / more
 * specific suffixes win.
 */
export const AI_VENDOR_HOSTS = {
    openai: ['api.openai.com'],
    anthropic: ['api.anthropic.com'],
    google: ['generativelanguage.googleapis.com'],
};
export const defaultAppSettings = {
    appearance: {
        themeMode: 'system',
        density: 'cozy',
        fontFamily: 'system',
        baseFontSize: 14,
        mailLayout: 'columns',
        mailFolderView: 'by-account',
        mailToolbar: DEFAULT_MAIL_TOOLBAR,
    },
    accessibility: defaultAccessibilitySettings,
    notifications: {
        enabled: true,
        batchIntervalMin: 15,
        dockBadge: false,
        perAccount: {},
    },
    ai: { mode: 'off' },
    updates: {
        optIn: false,
        channel: 'latest',
    },
    focus: {
        defaultDurationMin: 25,
        pomodoroBreaksEnabled: true,
        breakReminderEveryMin: 45,
    },
};
//# sourceMappingURL=models.js.map