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

const draftSchema = z.object({
  accountId,
  to: z.array(addressSchema).min(1).max(50),
  cc: z.array(addressSchema).max(50).optional(),
  bcc: z.array(addressSchema).max(50).optional(),
  subject: z.string().max(998).optional(), // RFC 5322 line-length cap
  body: z.string().max(5_000_000), // ~5 MB body cap
  html: z.string().max(5_000_000).optional(),
  inReplyTo: z.string().max(1024).optional(),
  references: z.array(z.string().max(1024)).max(50).optional(),
  attachments: z.array(
    z.object({
      filename: z.string().max(512),
      mimeType: z.string().max(255),
      sizeBytes: z.number().int().nonnegative().max(50 * 1024 * 1024), // 50 MB
      contentBase64: z.string().max(100_000_000),
    }),
  ).max(20).optional(),
});

// ---- per-channel schemas ----

export const SettingsUpdateSchema = z.object({}).passthrough();

export const AccountIdSchema = accountId;

export const AddAccountInputSchema = z.object({
  kind: z.enum(['gmail', 'microsoft', 'imap-smtp', 'pop3', 'apple-caldav']),
  displayName: z.string().max(256).optional(),
  emailAddress: z.string().email().max(320),
  // The rest of the fields are provider-specific and validated by the
  // per-provider builder. We only enforce the top-level shape here.
}).passthrough();

export const OAuthKindSchema = z.enum(['gmail', 'microsoft']);

export const MailSendSchema = draftSchema;

export const MailSaveDraftSchema = draftSchema;

export const MailReplySchema = z.object({
  messageId,
  replyAll: z.boolean().optional(),
  body: z.string().max(5_000_000),
  html: z.string().max(5_000_000).optional(),
});

export const MailForwardSchema = z.object({
  messageId,
  to: z.array(addressSchema).min(1).max(50),
  body: z.string().max(5_000_000),
  html: z.string().max(5_000_000).optional(),
});

export const MailSetFlagSchema = z.object({
  messageId,
  flag: z.enum(['read', 'unread', 'flagged', 'unflagged']),
});

export const MailSnoozeSchema = z.object({
  messageId,
  wakeAt: z.number().int().min(0).max(8.64e15),
});

export const MailMoveSchema = z.object({
  messageId,
  toFolderId: folderId,
});

export const MailArchiveSchema = z.object({ messageId });
export const MailTrashSchema = z.object({ messageId });
export const MailMarkReadSchema = z.object({ messageId, read: z.boolean() });
export const MailMarkSpamSchema = z.object({ messageId, isSpam: z.boolean() });

export const MailSearchSchema = z.object({
  query: z.string().max(2048),
  accountId: accountId.optional(),
  folderId: folderId.optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const CalCreateSchema = z.object({}).passthrough(); // CalendarEvent shape varies per provider
export const CalUpdateSchema = z.object({}).passthrough();
export const CalDeleteSchema = z.object({
  accountId,
  calendarId: shortString,
  eventId: shortString,
});

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
export const TasksDeleteSchema = z.object({
  accountId,
  listId: shortString,
  taskId: shortString,
});

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
  name: z.string().min(1).max(256).regex(/^[A-Za-z0-9._:\-/]+$/, 'invalid model name'),
});
export const AiDeleteModelSchema = AiPullModelSchema;

export const FocusStartSchema = z.object({
  durationMin: z.number().int().min(1).max(24 * 60),
  allowMailFrom: z.array(z.string().email().max(320)).max(100).optional(),
});

export const SchedulerCancelSchema = z.object({ jobId: nonEmptyString });

// Actual wire shape from the renderer: `{ email, http?, mailto?, oneClick }`.
// We also enforce that `http`, if present, is an HTTPS URL — never plain
// http (would expose the unsubscribe token to passive observers).
export const UnsubPerformSchema = z.object({
  email: z.string().email().max(320),
  http: z.string().url().regex(/^https:\/\//i, 'unsubscribe HTTP URL must be https').optional(),
  mailto: z.string().regex(/^mailto:/i).max(2048).optional(),
  oneClick: z.boolean(),
});
export const UnsubMuteSchema = z.object({ email: z.string().email().max(320) });
export const UnsubUnmuteSchema = z.object({ email: z.string().email().max(320) });
export const UnsubDismissSchema = z.object({ email: z.string().email().max(320) });

void optEpoch;
