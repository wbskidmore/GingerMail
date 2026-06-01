import { randomUUID } from 'node:crypto';
import type {
  Account,
  CalendarEvent,
  Draft,
  ProviderKind,
  Suggestion,
  Task,
} from '@gingermail/core';
import type { AppContext } from '../context.js';

const MAIL_KINDS: ReadonlySet<ProviderKind> = new Set<ProviderKind>([
  'gmail',
  'microsoft',
  'imap-smtp',
  'pop3',
  'apple-caldav',
]);

export interface ApplyResult {
  ok: boolean;
  /** The entity id created (task/event/scheduler job), when applicable. */
  entityId?: string;
  /** For `email` suggestions: a prefilled Draft the renderer should open. */
  draft?: Draft;
  error?: string;
}

/**
 * Turn an accepted/auto-approved suggestion into the corresponding entity.
 *
 * - `task`     -> upsert a Task (+ schedule a due notification).
 * - `event`    -> upsert a CalendarEvent (+ schedule its reminders).
 * - `reminder` -> schedule a one-off reminder notification.
 * - `email`    -> build (never send) a prefilled Draft and return it.
 *
 * The function is intentionally side-effect-only for tasks/events/reminders so
 * both the "accept" IPC handler and the auto-add agent can share it.
 */
export function applySuggestion(ctx: AppContext, s: Suggestion): ApplyResult {
  switch (s.category) {
    case 'task':
      return createTask(ctx, s);
    case 'event':
      return createEvent(ctx, s);
    case 'reminder':
      return createReminder(ctx, s);
    case 'email':
      return { ok: true, draft: buildDraft(ctx, s) };
    default:
      return { ok: false, error: `Unknown category ${String(s.category)}` };
  }
}

function ensureLocalTaskList(ctx: AppContext): string {
  const lists = ctx.db.listTaskLists();
  const existing = lists[0]?.id;
  if (existing) return existing;
  ctx.db.upsertTaskLists([{ id: 'local:default', accountId: 'local', name: 'Local tasks' }]);
  return 'local:default';
}

function createTask(ctx: AppContext, s: Suggestion): ApplyResult {
  const listId = ensureLocalTaskList(ctx);
  const due = parseIso(s.payload.due) ?? parseIso(s.payload.when);
  const task: Task = {
    id: `sug-${s.id}`,
    listId,
    accountId: 'local',
    title: s.title,
    notes: s.payload.notes,
    status: 'open',
    starred: false,
    due,
    position: 0,
    linkedMessageId: s.source === 'mail' ? s.sourceId : undefined,
  };
  ctx.db.upsertTasks([task]);
  if (due && due > Date.now()) {
    ctx.scheduler.schedule({
      kind: 'task-due',
      fireAt: due,
      payload: { title: task.title, taskId: task.id, notes: task.notes ?? '' },
    });
  }
  return { ok: true, entityId: task.id };
}

function createEvent(ctx: AppContext, s: Suggestion): ApplyResult {
  const start = parseIso(s.payload.when);
  if (!start) return { ok: false, error: 'Event has no start time' };
  const end = parseIso(s.payload.end) ?? start + 60 * 60_000;
  const event: CalendarEvent = {
    id: `sug-${s.id}`,
    calendarId: 'local:default',
    accountId: 'local',
    title: s.title,
    description: s.payload.notes,
    location: s.payload.location,
    start,
    end,
    allDay: false,
    status: 'confirmed',
    reminders: [10],
    linkedMessageId: s.source === 'mail' ? s.sourceId : undefined,
  };
  ctx.db.upsertEvents([event]);
  for (const minutes of event.reminders ?? [10]) {
    const fireAt = event.start - minutes * 60_000;
    if (fireAt < Date.now()) continue;
    ctx.scheduler.schedule({
      kind: 'event-reminder',
      fireAt,
      payload: { title: event.title, when: new Date(event.start).toLocaleString(), eventId: event.id },
    });
  }
  return { ok: true, entityId: event.id };
}

function createReminder(ctx: AppContext, s: Suggestion): ApplyResult {
  const fireAt = parseIso(s.payload.when) ?? parseIso(s.payload.due);
  if (!fireAt) return { ok: false, error: 'Reminder has no time' };
  if (fireAt < Date.now()) return { ok: false, error: 'Reminder time is in the past' };
  const job = ctx.scheduler.schedule({
    kind: 'reminder',
    fireAt,
    payload: { title: s.title, notes: s.payload.notes ?? '', when: new Date(fireAt).toLocaleString() },
  });
  return { ok: true, entityId: job.id };
}

function buildDraft(ctx: AppContext, s: Suggestion): Draft {
  const accountId = firstMailAccount(ctx)?.id ?? s.accountId ?? 'local';
  return {
    id: `sug-${s.id}`,
    accountId,
    to: s.payload.to ? [{ email: s.payload.to }] : [],
    subject: s.payload.subject ?? s.title,
    bodyText: s.payload.body ?? '',
  };
}

function firstMailAccount(ctx: AppContext): Account | undefined {
  return ctx.db.listAccounts().find((a) => MAIL_KINDS.has(a.kind));
}

/**
 * For an auto-added email suggestion we never send — but we try to persist the
 * draft to the user's mailbox so it shows up in Drafts. Best-effort: silently
 * no-ops when no mail provider supports saveDraft.
 */
export async function autoSaveDraft(ctx: AppContext, draft: Draft): Promise<string | undefined> {
  try {
    const provider = await ctx.getMailProvider(draft.accountId);
    if (!provider?.saveDraft) return undefined;
    const saved = await provider.saveDraft(draft);
    return saved.id;
  } catch {
    return undefined;
  }
}

function parseIso(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export function newSuggestionId(): string {
  return randomUUID();
}
