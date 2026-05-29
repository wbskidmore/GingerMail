export type ProviderKind = 'gmail' | 'microsoft' | 'apple-caldav' | 'imap-smtp' | 'pop3' | 'slack';

export interface Account {
  id: string;
  kind: ProviderKind;
  displayName: string;
  emailAddress: string;
  color?: string;
  createdAt: number;
  syncIntervalSec: number;
  signature?: string;
  enabled: boolean;
}

export interface ImapSmtpConfig {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
}

export interface Pop3Config {
  pop3Host: string;
  pop3Port: number;
  pop3Secure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
}

export interface OAuthConfig {
  clientId: string;
  scopes: string[];
}

export type FolderRole =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'trash'
  | 'spam'
  | 'archive'
  | 'all'
  | 'custom';

export interface Folder {
  id: string;
  accountId: string;
  name: string;
  path: string;
  role: FolderRole;
  unreadCount: number;
  totalCount: number;
}

export interface Address {
  name?: string;
  email: string;
}

export interface MessageHeader {
  id: string;
  accountId: string;
  folderId: string;
  threadId: string;
  uid: string;
  from: Address;
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  subject: string;
  snippet: string;
  date: number;
  unread: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  labels: string[];
  energyTag?: EnergyTag;
  snoozedUntil?: number;
}

export interface MessageBody {
  html?: string;
  text?: string;
}

export interface MessagePart {
  partId: string;
  contentType: string;
  filename?: string;
  size: number;
  cid?: string;
}

export interface Message extends MessageHeader {
  body: MessageBody;
  attachments: MessagePart[];
  inReplyTo?: string;
  references?: string[];
  rawHeaders?: Record<string, string>;
  /** RFC 8058 one-click https unsubscribe target, when the message declares one. */
  listUnsubscribeHttp?: string;
  /** RFC 2369 mailto-style unsubscribe target, when present. */
  listUnsubscribeMailto?: string;
  /** True when the message includes `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. */
  listUnsubscribePost?: boolean;
}

/** Sender-level decisions persisted in `sender_actions`. */
export interface SenderAction {
  email: string;
  action: 'unsubscribed' | 'muted' | 'dismissed';
  decidedAt: number;
  source: string;
}

/**
 * Renderer-visible unsubscribe / mute methods for a single sender. The
 * detection module materialises this from cached message data + List-Unsubscribe
 * headers; performUnsubscribe consumes it.
 */
export interface UnsubscribeMethods {
  /** Preferred when set: RFC 8058 https://… POST endpoint. */
  http?: string;
  /** Fallback: mailto:unsubscribe@example.com URL. */
  mailto?: string;
  /** True when the http endpoint accepts one-click POST. */
  oneClick: boolean;
}

export interface UnsubscribeSuggestion {
  email: string;
  /** Display name we'll show on the banner / review modal. */
  displayName?: string;
  /** AI verdict (only present when AI assist is enabled). */
  aiVerdict?: 'unsubscribe' | 'mute';
  /** Short human-readable AI explanation. */
  aiReason?: string;
  /** Trashed-vs-opened count over the lookback window. */
  trashedCount: number;
  totalSeen: number;
  /** Most recent message id referencing this sender, useful for "open example". */
  exampleMessageId?: string;
  methods: UnsubscribeMethods;
  /** Optional AI-supplied confidence; null when the heuristic alone surfaced this. */
  aiConfidence?: number;
}

export interface MutedSender {
  email: string;
  mutedAt: number;
}

export interface Draft {
  id?: string;
  accountId: string;
  inReplyTo?: string;
  references?: string[];
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: { filename: string; path: string }[];
}

export type EnergyTag = 'high' | 'medium' | 'low';

export interface MessageThread {
  id: string;
  accountId: string;
  subject: string;
  participants: Address[];
  messageIds: string[];
  lastMessageAt: number;
  unread: boolean;
  flagged: boolean;
  energyTag?: EnergyTag;
}

// Calendar

export type CalendarColor = string;

export interface Calendar {
  id: string;
  accountId: string;
  name: string;
  color: CalendarColor;
  readonly: boolean;
  primary: boolean;
}

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

export interface CalendarEvent {
  id: string;
  calendarId: string;
  accountId: string;
  title: string;
  description?: string;
  location?: string;
  start: number;
  end: number;
  allDay: boolean;
  status: EventStatus;
  organizer?: Address;
  attendees?: Address[];
  recurrenceRule?: string;
  reminders?: number[]; // minutes before start
  linkedMessageId?: string;
  linkedTaskId?: string;
  snoozedUntil?: number;
}

// Tasks

export type TaskStatus = 'open' | 'completed';

export interface TaskList {
  id: string;
  accountId: string;
  name: string;
  color?: string;
}

export interface Task {
  id: string;
  listId: string;
  accountId: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  starred: boolean;
  due?: number;
  completedAt?: number;
  energyTag?: EnergyTag;
  snoozedUntil?: number;
  linkedMessageId?: string;
  linkedEventId?: string;
  position: number;
}

// Chat (Slack)

export type ChatConversationKind = 'im' | 'mpim' | 'channel' | 'group';

/**
 * A Slack (or future chat provider) conversation: a DM, a group DM, or a
 * channel. `id` is the provider-scoped `accountId:conversationId` so it is
 * unique across multiple connected workspaces, matching the mail id scheme.
 */
export interface ChatConversation {
  id: string;
  accountId: string;
  /** Provider-native conversation id (e.g. Slack `C…`/`D…`/`G…`). */
  conversationId: string;
  kind: ChatConversationKind;
  /** Display name: channel name (`#general`) or the other member's name. */
  name: string;
  /** Slack user id of the DM partner, when this is a 1:1 IM. */
  partnerUserId?: string;
  unreadCount: number;
  /** True when the conversation has an unread @-mention or is a DM with unread. */
  hasMention: boolean;
  lastMessageAt: number;
  /** Whether the signed-in user is a member (channels can be browsable but unjoined). */
  isMember: boolean;
}

export interface ChatUser {
  id: string;
  accountId: string;
  /** Provider-native user id (Slack `U…`). */
  userId: string;
  displayName: string;
  /** Two-letter initials we render as a low-stimulation avatar. */
  initials: string;
  isBot: boolean;
}

export interface ChatMessage {
  /** `accountId:conversationId:ts` — stable + globally unique. */
  id: string;
  accountId: string;
  conversationId: string;
  /** Slack message timestamp ("1700000000.000100"); doubles as the cursor. */
  ts: string;
  /** Authoring user id (Slack `U…`); absent for some system messages. */
  userId?: string;
  authorName: string;
  /** Plain-text rendering of the message (mrkdwn flattened). */
  text: string;
  createdAt: number;
  /** True when the message @-mentions the signed-in user. */
  mentionsMe: boolean;
  /** External links / files surfaced as openable URLs (rendered as links). */
  links?: string[];
}

// AI

export interface AiSummary {
  threadId: string;
  summary: string;
  actionItems: string[];
}

// Notifications + scheduling

export type ScheduledJobKind =
  | 'event-reminder'
  | 'task-due'
  | 'snooze-wake'
  | 'ai-digest'
  | 'focus-break';

export interface ScheduledJob {
  id: string;
  kind: ScheduledJobKind;
  fireAt: number;
  payload: Record<string, unknown>;
  createdAt: number;
  firedAt?: number;
}

// Settings

export type ThemeMode = 'system' | 'light' | 'dark';
export type DensityMode = 'compact' | 'cozy' | 'spacious';

/**
 * How the Mail tab arranges its three regions (folders / list / reading pane).
 *  - `columns`  : Apple Mail style 3 vertical columns (folders | list | message)
 *  - `stacked`  : Outlook classic — folders on the left, message list on top,
 *                 reading pane below
 *  - `focus`    : narrow list + wide reading pane, folders collapsed into a
 *                 toggleable drawer; minimal chrome for one-message-at-a-time
 */
export type MailLayout = 'columns' | 'stacked' | 'focus';

/**
 * How the Mail sidebar groups folders.
 *  - `by-account` : original — each account expands to its own folder tree
 *  - `unified`    : merge folders by role across accounts (one Inbox, one
 *                   Sent, etc.) so the user sees mail logically, not by login
 *  - `smart`      : virtual mailboxes first (Today, Unread, Starred, Snoozed,
 *                   With attachments), then all accounts flat at the bottom
 */
export type MailFolderView = 'by-account' | 'unified' | 'smart';

/**
 * IDs of every action surfaced on the Mail tab toolbar / row hover-strip /
 * right-click menu. The renderer keeps a single ActionRegistry keyed off this
 * union (apps/renderer/src/mail/actions.ts) so toolbar visibility, the More
 * menu, and the keyboard-shortcut map all stay in sync.
 *
 * Adding a new id here must be accompanied by:
 *   - a registry entry in apps/renderer/src/mail/actions.ts
 *   - bumping the defaults in defaultAppSettings.appearance.mailToolbar below
 */
export type MailActionId =
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'archive'
  | 'trash'
  | 'move'
  | 'markUnread'
  | 'flag'
  | 'snooze'
  | 'spam'
  | 'print'
  | 'aiSummarise';

/**
 * Per-user customisation of the MessagePane toolbar.
 *  - `visible`  : rendered inline as ActionIcons, in this exact order.
 *  - `overflow` : packed under a single `IconDots` "More" Menu, in this order.
 *  - Any action id not listed in either array is treated as Hidden — never
 *    shown in the message-pane toolbar (but still available via right-click
 *    context menu and keyboard shortcut).
 */
export interface MailToolbarSettings {
  visible: MailActionId[];
  overflow: MailActionId[];
}

export const DEFAULT_MAIL_TOOLBAR: MailToolbarSettings = {
  visible: ['reply', 'replyAll', 'forward', 'archive', 'trash', 'flag', 'snooze', 'aiSummarise'],
  overflow: ['move', 'markUnread', 'spam', 'print'],
};

export interface AppearanceSettings {
  themeMode: ThemeMode;
  density: DensityMode;
  fontFamily: 'system' | 'dyslexic' | 'lexend';
  baseFontSize: number;
  accentOverride?: string;
  /** Mail tab layout (defaults to `columns`). */
  mailLayout?: MailLayout;
  /** Mail sidebar folder organisation (defaults to `by-account`). */
  mailFolderView?: MailFolderView;
  /** Customisable Mail toolbar (defaults to DEFAULT_MAIL_TOOLBAR). */
  mailToolbar?: MailToolbarSettings;
}

/**
 * Accessibility-specific settings. Kept in their own block so they can be
 * surfaced in a dedicated Accessibility settings tab rather than buried
 * inside Appearance.
 *
 * `reduceMotion`/`highContrast` default to `'system'` so we follow the OS
 * preference unless the user explicitly overrides; ADHD users in QA wanted
 * a separate per-app toggle because reducing motion globally caused
 * jarring side-effects elsewhere on their machine.
 */
export type Tristate = 'system' | 'on' | 'off';

export interface AccessibilitySettings {
  reduceMotion: Tristate;
  highContrast: Tristate;
  /** Show focus rings even when navigating with the mouse (always-on focus). */
  alwaysShowFocus: boolean;
  /** Show keyboard shortcut hints next to menu items. */
  showShortcutHints: boolean;
  /** Quiet hours window (minutes from midnight) where toasts are suppressed. */
  quietHoursStartMin?: number;
  quietHoursEndMin?: number;
}

export const defaultAccessibilitySettings: AccessibilitySettings = {
  reduceMotion: 'system',
  highContrast: 'system',
  alwaysShowFocus: true,
  showShortcutHints: true,
};

export interface NotificationSettings {
  enabled: boolean;
  batchIntervalMin: number;
  dndStartMin?: number; // minutes from midnight
  dndEndMin?: number;
  dockBadge: boolean;
  perAccount: Record<string, boolean>;
}

export type AiMode = 'off' | 'cloud' | 'local';

export interface AiSettings {
  mode: AiMode;
  cloud?: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    /**
     * Cloud vendor. `openai` covers any OpenAI-compatible endpoint (OpenAI,
     * Together, Groq, OpenRouter, local LM Studio, etc.). `anthropic` and
     * `google` need bespoke request/response shapes — see `CloudAiClient`.
     */
    vendor: 'openai' | 'anthropic' | 'google';
  };
  local?: {
    baseUrl: string;
    model: string;
  };
  /**
   * Privacy posture for cloud-mode AI calls. Enforced in the main process
   * (the renderer cannot disable it).
   */
  privacy?: {
    /**
     * When true, the main-process egress filter rewrites obvious PII (card
     * numbers, SSNs, US phone numbers, OTPs) to placeholders before the
     * request body is sent to the cloud AI vendor. Default false so the
     * user has to opt in (matches the old behavior).
     */
    redactPii: boolean;
    /**
     * When true, the main process refuses to send mail bodies from accounts
     * whose `id` appears in `sensitiveAccountIds` to ANY cloud AI vendor.
     * UI uses this for the "tagged Sensitive" per-account flag.
     */
    blockSensitiveAccounts: boolean;
    sensitiveAccountIds: string[];
  };
}

/**
 * Allowed AI egress hostnames per vendor. Production main process
 * enforces these via a session.webRequest.onBeforeRequest filter on
 * the AI process partition. Adding a host means the user can pick
 * that vendor; removing one immediately blocks new requests.
 *
 * Order matters for "is this URL allowed?" checks: longer / more
 * specific suffixes win.
 */
export const AI_VENDOR_HOSTS: Record<'openai' | 'anthropic' | 'google', string[]> = {
  openai: ['api.openai.com'],
  anthropic: ['api.anthropic.com'],
  google: ['generativelanguage.googleapis.com'],
};

export interface UpdatesSettings {
  /**
   * Auto-update is opt-in. We default to FALSE because:
   *   - Until the update feed is reachable, checking is just wasted load.
   *   - Users on metered connections deserve to opt in explicitly.
   *   - Some regulated environments forbid background self-update.
   * The Settings card surfaces a one-tap toggle + "Check now" button.
   */
  optIn: boolean;
  /** "latest" by default; "beta" exists for opt-in pre-release rings. */
  channel: 'latest' | 'beta';
  /** When set, the user has been informed about update v<version> already. */
  lastNotifiedVersion?: string;
}

/**
 * Slack / chat behaviour. Polling-based in v1 (no always-on socket), so the
 * interval is user-tunable. Notifications default to mentions + DMs only so
 * the tab stays low-stimulation for ADHD users; channel chatter never pings.
 */
export interface ChatSettings {
  /** Master switch for the Slack tab + background polling. */
  enabled: boolean;
  /** Seconds between background unread/message polls. */
  pollIntervalSec: number;
  /** Notify on direct messages. */
  notifyOnDirectMessage: boolean;
  /** Notify on @-mentions in channels. */
  notifyOnMention: boolean;
}

export const defaultChatSettings: ChatSettings = {
  enabled: true,
  pollIntervalSec: 60,
  notifyOnDirectMessage: true,
  notifyOnMention: true,
};

export interface AppSettings {
  appearance: AppearanceSettings;
  accessibility: AccessibilitySettings;
  notifications: NotificationSettings;
  ai: AiSettings;
  /**
   * Slack / chat settings. Optional for backwards compat with older
   * persisted prefs; callers should fall back to `defaultChatSettings`.
   */
  chat?: ChatSettings;
  /**
   * Optional only for backwards compat with renderer-side stub settings
   * that were authored before #3 landed. Real settings written by the
   * main process always have this populated.
   */
  updates?: UpdatesSettings;
  focus: {
    defaultDurationMin: number;
    pomodoroBreaksEnabled: boolean;
    breakReminderEveryMin: number;
  };
}

export const defaultAppSettings: AppSettings = {
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
  chat: defaultChatSettings,
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
