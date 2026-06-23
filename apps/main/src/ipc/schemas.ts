/**
 * Zod schemas for IPC channel inputs that either MUTATE state, EGRESS
 * to the network, or CONSUME a path / URL the renderer supplied.
 *
 * Read-only channels (mailListFolders, mailGetMessage, …) intentionally
 * remain unvalidated; their inputs are small strings whose worst case is
 * a SQL bind-param mismatch.
 *
 * Each schema is exported under the SAME NAME as the channel constant so
 * the register.ts side can grep-and-pair them. Adding a new write-path
 * channel WITHOUT also adding a schema here will fail the
 * `coverage.test.ts` audit below.
 */
import { z } from 'zod';

// ---- helpers ----
const nonEmptyString = z.string().min(1).max(2048);
const shortString = z.string().min(1).max(512);
const accountId = z.string().min(1).max(256);
const messageId = z.string().min(1).max(1024);
const folderId = z.string().min(1).max(1024);
const optEpoch = z.number().int().min(0).max(8.64e15).optional();

const addressSchema = z.object({
  name: z.string().max(256).optional(),
  email: z.string().email().max(320),
});

// A composite message/event id as produced by the providers, e.g.
// "accountId:folderId:uid" or "local:<uuid>". Bounded but opaque.
const messageRef = z.string().min(1).max(1024);

// Matches the `Draft` shape in `@gingermail/core` (NOT a hypothetical wire
// shape). `to` may be empty for a forward draft the user has not addressed
// yet. Fields are optional/lenient to avoid rejecting legitimate composer
// payloads, but every field is type- and size-bounded (SI-10).
const draftSchema = z.object({
  id: z.string().max(1024).optional(),
  accountId,
  inReplyTo: z.string().max(1024).optional(),
  references: z.array(z.string().max(1024)).max(100).optional(),
  to: z.array(addressSchema).max(100),
  cc: z.array(addressSchema).max(100).optional(),
  bcc: z.array(addressSchema).max(100).optional(),
  subject: z.string().max(998).optional(), // RFC 5322 line-length cap
  bodyHtml: z.string().max(5_000_000).optional(), // ~5 MB body cap
  bodyText: z.string().max(5_000_000).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().max(512),
        path: z.string().max(4096),
      }),
    )
    .max(50)
    .optional(),
});

// ---- per-channel schemas ----
//
// Each schema below matches the ACTUAL wire shape the corresponding handler
// in `register.ts` / `aiHandlers.ts` receives. The `ipc/coverage.test.ts`
// audit asserts that every state-mutating / network-egress / path-consuming
// channel has a schema here and that the schema is wired via `safeHandle`.

// Settings: the renderer sends a partial patch. We bound the *top-level* keys
// to the known `AppSettings` shape (`appearance`, `accessibility`,
// `notifications`, `ai`, `updates`, `focus`) with `.strict()` so a renderer
// cannot inject arbitrary top-level keys, while leaving nested shapes flexible
// (the main process strips secrets like `ai.cloud.apiKey` in
// `context.updateSettings`). This replaces the previous unbounded
// `z.object({}).passthrough()` (SI-10).
export const SettingsUpdateSchema = z
  .object({
    appearance: z.object({}).passthrough().optional(),
    accessibility: z.object({}).passthrough().optional(),
    notifications: z.object({}).passthrough().optional(),
    ai: z.object({}).passthrough().optional(),
    updates: z.object({}).passthrough().optional(),
    focus: z.object({}).passthrough().optional(),
  })
  .strict();

export const AccountIdSchema = accountId;

// NOTE on `.passthrough()`: account creation deliberately passes provider-
// specific fields (imapHost, smtpPort, password, app-specific password, ...)
// through to the per-provider builder, which validates them. Removing
// passthrough here would STRIP those required fields and break account setup.
// We therefore bound the top-level shape (kind + email) and let the provider
// builder own the rest. (SI-10 with a documented exception.)
export const AddAccountInputSchema = z
  .object({
    kind: z.enum(['gmail', 'microsoft', 'imap-smtp', 'pop3', 'apple-caldav']),
    displayName: z.string().max(256).optional(),
    emailAddress: z.string().email().max(320),
  })
  .passthrough();

export const OAuthKindSchema = z.enum(['gmail', 'microsoft']);

export const MailSendSchema = draftSchema;

export const MailSaveDraftSchema = draftSchema;

export const MailReplySchema = z.object({
  id: messageRef,
  all: z.boolean(),
});

export const MailForwardSchema = z.object({ id: messageRef });

export const MailSetFlagSchema = z.object({
  id: messageRef,
  flag: z.enum(['read', 'unread', 'star', 'unstar']),
});

export const MailSnoozeSchema = z.object({
  id: messageRef,
  until: z.number().int().min(0).max(8.64e15),
});

export const MailMoveSchema = z.object({
  id: messageRef,
  folderId,
});

export const MailArchiveSchema = z.object({ id: messageRef });
export const MailTrashSchema = z.object({ id: messageRef });
export const MailMarkSpamSchema = z.object({ id: messageRef });
export const MailPrintSchema = z.object({ id: messageRef });
export const MailMarkReadSchema = z.object({ id: messageRef, read: z.boolean() });

// mailSearch receives a bare query string.
export const MailSearchSchema = z.string().max(2048);

// CalendarEvent wire shape (matches `CalendarEvent` in `@gingermail/core`).
// Every field is type- and size-bounded so a compromised renderer cannot push
// unbounded payloads to the provider APIs (SI-10). `attendees` and `reminders`
// are explicitly allowed so the composer's invite + reminder fields validate.
const epochMs = z.number().int().min(0).max(8.64e15);
const calendarEventFields = {
  calendarId: z.string().min(1).max(1024),
  accountId,
  title: z.string().max(1024),
  description: z.string().max(100_000).optional(),
  location: z.string().max(2048).optional(),
  start: epochMs,
  end: epochMs,
  allDay: z.boolean(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']),
  organizer: addressSchema.optional(),
  attendees: z.array(addressSchema).max(500).optional(),
  recurrenceRule: z.string().max(4096).optional(),
  // minutes before start; cap at 4 weeks (40320 min).
  reminders: z.array(z.number().int().min(0).max(40_320)).max(20).optional(),
  linkedMessageId: z.string().max(1024).optional(),
  linkedTaskId: z.string().max(1024).optional(),
  snoozedUntil: epochMs.optional(),
};

export const CalCreateSchema = z.object(calendarEventFields);
export const CalUpdateSchema = z.object({ id: messageRef, ...calendarEventFields });
// calDelete receives a bare composite event id string.
export const CalDeleteSchema = messageRef;

// ICS import: take the *content* as a string instead of a filesystem path
// so the renderer can never coerce the main process into reading an
// arbitrary file (which would otherwise be a sandbox escape).
export const CalImportIcsSchema = z.object({
  accountId,
  calendarId: shortString,
  icsContent: z.string().max(10_000_000), // 10 MB cap
});

export const TasksCreateSchema = z.object({}).passthrough();
export const TasksUpdateSchema = z.object({}).passthrough();
// tasksDelete receives a bare composite task id string.
export const TasksDeleteSchema = messageRef;

export const AiTestSchema = z.object({}).passthrough();
export const AiSummarizeSchema = z.object({
  messageIds: z.array(messageId).min(1).max(100),
});
export const AiDraftReplySchema = z.object({
  messageId,
  tone: z.enum(['concise', 'friendly', 'formal']).optional(),
  bullets: z.array(nonEmptyString).max(20).optional(),
});
export const AiNlSearchSchema = z.object({
  query: z.string().max(1024),
});
export const AiSetCloudKeySchema = z.object({
  key: z.string().min(1).max(4096),
});
export const AiPullModelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9._:\-/]+$/, 'invalid model name'),
});
export const AiDeleteModelSchema = AiPullModelSchema;

export const FocusStartSchema = z.object({
  durationMin: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  allowMailFrom: z.array(z.string().email().max(320)).max(100).optional(),
});

// schedulerCancel receives a bare job id string.
export const SchedulerCancelSchema = z.string().min(1).max(512);

// Actual wire shape from the renderer: `{ email, http?, mailto?, oneClick }`.
// We also enforce that `http`, if present, is an HTTPS URL — never plain
// http (would expose the unsubscribe token to passive observers).
export const UnsubPerformSchema = z.object({
  email: z.string().email().max(320),
  http: z
    .string()
    .url()
    .regex(/^https:\/\//i, 'unsubscribe HTTP URL must be https')
    .optional(),
  mailto: z
    .string()
    .regex(/^mailto:/i)
    .max(2048)
    .optional(),
  oneClick: z.boolean(),
});
export const UnsubMuteSchema = z.object({ email: z.string().email().max(320) });
export const UnsubUnmuteSchema = z.object({ email: z.string().email().max(320) });
export const UnsubDismissSchema = z.object({ email: z.string().email().max(320) });

// ---- Slack / chat ----
// Native Slack conversation ids are short alphanumerics (C…/D…/G…); cap
// generously. The token is a secret bound for the keychain, never logged.
export const SlackConnectTokenSchema = z.object({
  token: z.string().min(8).max(512),
});
// `conversationId` here is the GLOBAL id (`slack:<team>:<native>`); the
// handler splits it on the final colon. 128 chars is comfortably above the
// real max (account id ~30 + native id ~12).
export const SlackSendSchema = z.object({
  conversationId: z.string().min(1).max(128),
  text: z.string().min(1).max(40_000), // Slack's per-message text cap
});
export const SlackMarkReadSchema = z.object({
  conversationId: z.string().min(1).max(128),
});
export const SlackDisconnectSchema = z.object({
  accountId,
});
export const SlackListMessagesSchema = z.object({
  conversationId: z.string().min(1).max(128),
  limit: z.number().int().min(1).max(200).optional(),
});

// ---- Discord ----
// Discord bot tokens are ~59-72 chars (three base64url segments). Cap
// generously; the token is bound for the keychain, never logged.
export const DiscordConnectTokenSchema = z.object({
  token: z.string().min(50).max(256),
});

// ---- Suggestions (AI detection agents) ----
const suggestionId = z.string().min(1).max(256);
export const SuggestionsAcceptSchema = z.object({ id: suggestionId });
export const SuggestionsRejectSchema = z.object({ id: suggestionId });
export const SuggestionsDismissSchema = z.object({ id: suggestionId });

void optEpoch;
