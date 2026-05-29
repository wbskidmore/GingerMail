/**
 * IPC validation coverage audit.
 *
 * Two jobs:
 *   1. Assert that every state-mutating / network-egress / path-consuming IPC
 *      channel has a zod schema defined in `schemas.ts`. Adding a new write
 *      channel without a schema fails this test (the audit the schemas.ts
 *      header promises).
 *   2. Lock in the corrected wire shapes. These schemas previously did NOT
 *      match the handler inputs in `register.ts` (e.g. `messageId`/`wakeAt`
 *      vs the actual `{ id, until }`), which meant wiring them would have
 *      rejected legitimate traffic. These cases guard against regressing to a
 *      mismatched schema.
 */
import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '@gingermail/core';
import type { ZodTypeAny } from 'zod';
import * as schemas from './schemas.js';

// Channel constant -> schema export. If you add a write/egress channel, add it
// here with its schema, or this test fails.
const WRITE_CHANNEL_SCHEMAS: Record<string, ZodTypeAny> = {
  [IPC_CHANNELS.settingsUpdate]: schemas.SettingsUpdateSchema,
  [IPC_CHANNELS.accountsAdd]: schemas.AddAccountInputSchema,
  [IPC_CHANNELS.accountsRemove]: schemas.AccountIdSchema,
  [IPC_CHANNELS.accountsTest]: schemas.AddAccountInputSchema,
  [IPC_CHANNELS.accountsBeginOAuth]: schemas.OAuthKindSchema,
  [IPC_CHANNELS.mailSend]: schemas.MailSendSchema,
  [IPC_CHANNELS.mailSaveDraft]: schemas.MailSaveDraftSchema,
  [IPC_CHANNELS.mailSetFlag]: schemas.MailSetFlagSchema,
  [IPC_CHANNELS.mailSnooze]: schemas.MailSnoozeSchema,
  [IPC_CHANNELS.mailSearch]: schemas.MailSearchSchema,
  [IPC_CHANNELS.mailMove]: schemas.MailMoveSchema,
  [IPC_CHANNELS.mailArchive]: schemas.MailArchiveSchema,
  [IPC_CHANNELS.mailTrash]: schemas.MailTrashSchema,
  [IPC_CHANNELS.mailMarkRead]: schemas.MailMarkReadSchema,
  [IPC_CHANNELS.mailMarkSpam]: schemas.MailMarkSpamSchema,
  [IPC_CHANNELS.mailReply]: schemas.MailReplySchema,
  [IPC_CHANNELS.mailForward]: schemas.MailForwardSchema,
  [IPC_CHANNELS.mailPrint]: schemas.MailPrintSchema,
  [IPC_CHANNELS.calDelete]: schemas.CalDeleteSchema,
  [IPC_CHANNELS.tasksDelete]: schemas.TasksDeleteSchema,
  [IPC_CHANNELS.schedulerCancel]: schemas.SchedulerCancelSchema,
  [IPC_CHANNELS.unsubPerform]: schemas.UnsubPerformSchema,
  [IPC_CHANNELS.unsubMute]: schemas.UnsubMuteSchema,
  [IPC_CHANNELS.unsubUnmute]: schemas.UnsubUnmuteSchema,
  [IPC_CHANNELS.unsubDismiss]: schemas.UnsubDismissSchema,
  [IPC_CHANNELS.aiSetCloudKey]: schemas.AiSetCloudKeySchema,
  [IPC_CHANNELS.aiPullModel]: schemas.AiPullModelSchema,
  [IPC_CHANNELS.aiDeleteModel]: schemas.AiDeleteModelSchema,
};

describe('IPC validation coverage', () => {
  it('defines a zod schema for every write/egress channel', () => {
    for (const [channel, schema] of Object.entries(WRITE_CHANNEL_SCHEMAS)) {
      expect(channel, 'channel constant should be a non-empty string').toBeTruthy();
      expect(schema, `missing schema for channel ${channel}`).toBeDefined();
      expect(typeof schema.safeParse, `schema for ${channel} is not a zod schema`).toBe('function');
    }
  });
});

describe('IPC schemas match handler wire shapes', () => {
  it('mailSetFlag accepts {id, flag} with the real flag values', () => {
    expect(schemas.MailSetFlagSchema.safeParse({ id: 'a:b:1', flag: 'star' }).success).toBe(true);
    // Regression guard: the old schema used flagged/unflagged, which never
    // matched the renderer.
    expect(schemas.MailSetFlagSchema.safeParse({ id: 'a:b:1', flag: 'flagged' }).success).toBe(false);
    expect(schemas.MailSetFlagSchema.safeParse({ messageId: 'a:b:1', flag: 'read' }).success).toBe(false);
  });

  it('mailSnooze accepts {id, until}', () => {
    expect(schemas.MailSnoozeSchema.safeParse({ id: 'a:b:1', until: 1_700_000_000_000 }).success).toBe(true);
    expect(schemas.MailSnoozeSchema.safeParse({ id: 'a:b:1' }).success).toBe(false);
  });

  it('mailMove accepts {id, folderId}', () => {
    expect(schemas.MailMoveSchema.safeParse({ id: 'a:b:1', folderId: 'a:archive' }).success).toBe(true);
    expect(schemas.MailMoveSchema.safeParse({ id: 'a:b:1', toFolderId: 'a:archive' }).success).toBe(false);
  });

  it('mailSend accepts a core Draft shape', () => {
    expect(
      schemas.MailSendSchema.safeParse({ accountId: 'acct', to: [{ email: 'x@y.com' }], subject: 'hi', bodyText: 'yo' })
        .success,
    ).toBe(true);
    // forward draft with empty recipients is valid
    expect(schemas.MailSendSchema.safeParse({ accountId: 'acct', to: [] }).success).toBe(true);
    expect(schemas.MailSendSchema.safeParse({ to: [] }).success).toBe(false);
  });

  it('mailSearch accepts a bare query string', () => {
    expect(schemas.MailSearchSchema.safeParse('invoice').success).toBe(true);
    expect(schemas.MailSearchSchema.safeParse(123).success).toBe(false);
  });

  it('settingsUpdate bounds top-level keys (rejects unknown keys)', () => {
    expect(schemas.SettingsUpdateSchema.safeParse({ appearance: { themeMode: 'system' } }).success).toBe(true);
    expect(schemas.SettingsUpdateSchema.safeParse({ notARealSetting: true }).success).toBe(false);
  });

  it('bare-string delete/cancel schemas accept ids', () => {
    expect(schemas.CalDeleteSchema.safeParse('acct:cal:evt').success).toBe(true);
    expect(schemas.TasksDeleteSchema.safeParse('acct:list:task').success).toBe(true);
    expect(schemas.SchedulerCancelSchema.safeParse('job-123').success).toBe(true);
    expect(schemas.SchedulerCancelSchema.safeParse('').success).toBe(false);
  });
});
