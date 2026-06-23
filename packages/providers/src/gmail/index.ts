import { createRequire } from 'node:module';
import type * as GoogleApis from 'googleapis';
import type { gmail_v1, calendar_v3, tasks_v1 } from 'googleapis';
const localRequire = createRequire(import.meta.url);
const { google } = localRequire('googleapis') as typeof GoogleApis;

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
import type {
  Account,
  Address,
  Calendar,
  CalendarEvent,
  Draft,
  Folder,
  Message,
  MessageHeader,
  Task,
  TaskList,
} from '@gingermail/core';
import type { CalendarProvider, MailProvider, Page, TaskProvider } from '../types.js';
import { parseListUnsubscribe } from '../unsubscribe.js';

export interface GmailTokens {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}

/**
 * Minimum-viable Gmail / Google scope set. Adding a scope here triggers
 * a re-consent prompt for every existing user — only do it for a real
 * feature need, and document the need on the line itself.
 *
 * Conscious omissions:
 *   - `gmail.readonly`  redundant once `gmail.modify` is present (`modify`
 *                       includes read).
 *   - `gmail.compose`   redundant once `gmail.send` is present.
 *   - `gmail.labels`    not requested; we manipulate labels through
 *                       gmail.modify which already covers it.
 *   - `userinfo.profile` not requested; we only need the email address
 *                        for account labeling, which `userinfo.email`
 *                        already provides via the OAuth2 v2 endpoint.
 */
export const GOOGLE_SCOPES = [
  // Read + write mail (archive, move, flag, mark read/unread). NOT
  // 'gmail.modify' aliases or `full` — `modify` is the explicit choice.
  'https://www.googleapis.com/auth/gmail.modify',
  // Sending mail (Reply / Reply All / Forward / Compose).
  'https://www.googleapis.com/auth/gmail.send',
  // Calendar events tab.
  'https://www.googleapis.com/auth/calendar',
  // Tasks tab.
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function buildGoogleAuth(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  tokens?: GmailTokens,
): OAuth2Client {
  const client = new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
  if (tokens) client.setCredentials(tokens);
  return client;
}

export function buildGoogleAuthUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent',
  });
}

export class GmailMailProvider implements MailProvider {
  private gmail: gmail_v1.Gmail;
  constructor(
    private readonly account: Account,
    private readonly auth: OAuth2Client,
  ) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listFolders(): Promise<Folder[]> {
    const res = await this.gmail.users.labels.list({ userId: 'me' });
    return (res.data.labels ?? []).map((l) => ({
      id: `${this.account.id}:${l.id}`,
      accountId: this.account.id,
      name: l.name ?? l.id ?? 'Folder',
      path: l.id ?? '',
      role: mapLabelToRole(l),
      unreadCount: 0,
      totalCount: 0,
    }));
  }

  async listMessageHeaders(
    folderId: string,
    cursor?: string,
    limit = 50,
  ): Promise<Page<MessageHeader>> {
    const labelId = folderId.split(':')[1] ?? 'INBOX';
    const list = await this.gmail.users.messages.list({
      userId: 'me',
      labelIds: [labelId],
      maxResults: limit,
      pageToken: cursor,
    });
    const items: MessageHeader[] = [];
    for (const m of list.data.messages ?? []) {
      if (!m.id) continue;
      const full = await this.gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
      });
      items.push(this.metadataToHeader(folderId, full.data));
    }
    return { items, nextCursor: list.data.nextPageToken ?? undefined };
  }

  async getMessage(folderId: string, uid: string): Promise<Message> {
    const full = await this.gmail.users.messages.get({ userId: 'me', id: uid, format: 'full' });
    const header = this.metadataToHeader(folderId, full.data);
    const body = extractGmailBody(full.data.payload ?? undefined);
    const headerMap = new Map<string, string>();
    for (const h of full.data.payload?.headers ?? []) {
      if (h.name && h.value) headerMap.set(h.name.toLowerCase(), h.value);
    }
    const lu = parseListUnsubscribe(
      headerMap.get('list-unsubscribe'),
      headerMap.get('list-unsubscribe-post'),
    );
    return {
      ...header,
      body,
      attachments: extractGmailAttachments(full.data.payload ?? undefined),
      listUnsubscribeHttp: lu.http,
      listUnsubscribeMailto: lu.mailto,
      listUnsubscribePost: lu.oneClick,
    };
  }

  async send(draft: Draft): Promise<void> {
    const raw = buildRfc822(draft, this.account);
    await this.gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  }

  async saveDraft(draft: Draft): Promise<Draft> {
    const raw = buildRfc822(draft, this.account);
    const res = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw } },
    });
    return { ...draft, id: res.data.id ?? draft.id };
  }

  async setFlag(input: {
    folderId: string;
    uid: string;
    flag: 'read' | 'unread' | 'star' | 'unstar';
  }): Promise<void> {
    const addMap = { read: [], unread: ['UNREAD'], star: ['STARRED'], unstar: [] };
    const removeMap = { read: ['UNREAD'], unread: [], star: [], unstar: ['STARRED'] };
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: input.uid,
      requestBody: { addLabelIds: addMap[input.flag], removeLabelIds: removeMap[input.flag] },
    });
  }

  /**
   * Gmail uses labels for folders. Move = add the destination label and
   * remove every label that we treat as "folder-like" (INBOX, SPAM, TRASH).
   * Special case: Archive on Gmail = remove INBOX with no destination add,
   * which is what `Trash` calls and what the registry binds to E.
   */
  async moveMessage(input: {
    fromFolderId: string;
    toFolderId: string;
    uid: string;
  }): Promise<{ uid: string }> {
    const fromLabel = input.fromFolderId.split(':')[1];
    const toLabel = input.toFolderId.split(':')[1] ?? '';
    const removeLabelIds = fromLabel && fromLabel !== toLabel ? [fromLabel] : [];
    const addLabelIds = toLabel ? [toLabel] : [];
    if (toLabel === 'TRASH') {
      await this.gmail.users.messages.trash({ userId: 'me', id: input.uid });
    } else if (toLabel === 'ARCHIVE' || (!toLabel && fromLabel === 'INBOX')) {
      // Archive = remove INBOX; no Gmail label called ARCHIVE.
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: input.uid,
        requestBody: { removeLabelIds: ['INBOX'] },
      });
    } else {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: input.uid,
        requestBody: { addLabelIds, removeLabelIds },
      });
    }
    return { uid: input.uid };
  }

  async reportSpam(input: { folderId: string; uid: string }): Promise<void> {
    // Gmail: applying SPAM label both moves the message to spam and trains
    // the per-account spam classifier.
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: input.uid,
      requestBody: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
    });
  }

  async search(query: string): Promise<MessageHeader[]> {
    const res = await this.gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50 });
    const items: MessageHeader[] = [];
    for (const m of res.data.messages ?? []) {
      if (!m.id) continue;
      const full = await this.gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
      });
      items.push(this.metadataToHeader(`${this.account.id}:SEARCH`, full.data));
    }
    return items;
  }

  async close(): Promise<void> {
    // googleapis maintains a pooled HTTP agent; nothing to close.
  }

  private metadataToHeader(folderId: string, m: gmail_v1.Schema$Message): MessageHeader {
    const headers = new Map<string, string>();
    for (const h of m.payload?.headers ?? []) {
      if (h.name && h.value) headers.set(h.name.toLowerCase(), h.value);
    }
    const fromHeader = headers.get('from') ?? '';
    const subject = headers.get('subject') ?? '';
    const dateStr = headers.get('date');
    const date = dateStr ? Date.parse(dateStr) : Date.now();
    return {
      id: `${this.account.id}:${m.id}`,
      accountId: this.account.id,
      folderId,
      threadId: m.threadId ?? m.id ?? '',
      uid: m.id ?? '',
      from: parseAddress(fromHeader),
      to: parseAddressList(headers.get('to')),
      cc: headers.get('cc') ? parseAddressList(headers.get('cc')) : undefined,
      subject,
      snippet: (m.snippet ?? '').slice(0, 200),
      date: Number.isNaN(date) ? Date.now() : date,
      unread: (m.labelIds ?? []).includes('UNREAD'),
      flagged: (m.labelIds ?? []).includes('STARRED'),
      hasAttachments: hasGmailAttachment(m.payload ?? undefined),
      labels: m.labelIds ?? [],
    };
  }
}

export class GoogleCalendarProvider implements CalendarProvider {
  private cal: calendar_v3.Calendar;
  constructor(
    private readonly account: Account,
    auth: OAuth2Client,
  ) {
    this.cal = google.calendar({ version: 'v3', auth });
  }

  async listCalendars(): Promise<Calendar[]> {
    const res = await this.cal.calendarList.list();
    return (res.data.items ?? []).map((c) => ({
      id: `${this.account.id}:${c.id}`,
      accountId: this.account.id,
      name: c.summary ?? c.id ?? 'Calendar',
      color: c.backgroundColor ?? '#3b82f6',
      readonly: c.accessRole === 'reader' || c.accessRole === 'freeBusyReader',
      primary: !!c.primary,
    }));
  }

  async listEvents(input: {
    from: number;
    to: number;
    calendarIds?: string[];
  }): Promise<CalendarEvent[]> {
    const cals = input.calendarIds ?? (await this.listCalendars()).map((c) => c.id);
    const events: CalendarEvent[] = [];
    for (const calId of cals) {
      const realId = calId.split(':').slice(1).join(':');
      const res = await this.cal.events.list({
        calendarId: realId,
        timeMin: new Date(input.from).toISOString(),
        timeMax: new Date(input.to).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
      });
      for (const e of res.data.items ?? []) {
        const ev = toCalendarEvent(this.account.id, calId, e);
        if (ev) events.push(ev);
      }
    }
    return events;
  }

  async createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    const realId = event.calendarId.split(':').slice(1).join(':');
    const res = await this.cal.events.insert({
      calendarId: realId,
      // `all` so Google emails calendar invitations to the attendees.
      sendUpdates: (event.attendees?.length ?? 0) > 0 ? 'all' : 'none',
      requestBody: buildGoogleEventBody(event),
    });
    const created = toCalendarEvent(this.account.id, event.calendarId, res.data);
    if (!created) throw new Error('Calendar event create failed');
    return created;
  }

  async updateEvent(event: CalendarEvent): Promise<CalendarEvent> {
    const realCal = event.calendarId.split(':').slice(1).join(':');
    const realId = event.id.split(':').slice(1).join(':');
    const res = await this.cal.events.update({
      calendarId: realCal,
      eventId: realId,
      sendUpdates: (event.attendees?.length ?? 0) > 0 ? 'all' : 'none',
      requestBody: buildGoogleEventBody(event),
    });
    const updated = toCalendarEvent(this.account.id, event.calendarId, res.data);
    if (!updated) throw new Error('Calendar event update failed');
    return updated;
  }

  async deleteEvent(id: string): Promise<void> {
    const [, calId, eventId] = id.split(':');
    if (!calId || !eventId) throw new Error('Invalid event id');
    await this.cal.events.delete({ calendarId: calId, eventId });
  }
}

export class GoogleTasksProvider implements TaskProvider {
  private tasks: tasks_v1.Tasks;
  constructor(
    private readonly account: Account,
    auth: OAuth2Client,
  ) {
    this.tasks = google.tasks({ version: 'v1', auth });
  }

  async listLists(): Promise<TaskList[]> {
    const res = await this.tasks.tasklists.list({ maxResults: 100 });
    return (res.data.items ?? []).map((l) => ({
      id: `${this.account.id}:${l.id}`,
      accountId: this.account.id,
      name: l.title ?? l.id ?? 'List',
    }));
  }

  async listTasks(listId?: string): Promise<Task[]> {
    const lists = listId ? [{ id: listId } as TaskList] : await this.listLists();
    const tasks: Task[] = [];
    let position = 0;
    for (const l of lists) {
      const realId = l.id.split(':').slice(1).join(':');
      const res = await this.tasks.tasks.list({
        tasklist: realId,
        showCompleted: true,
        showHidden: true,
      });
      for (const t of res.data.items ?? []) {
        position += 1;
        tasks.push({
          id: `${this.account.id}:${realId}:${t.id}`,
          listId: l.id,
          accountId: this.account.id,
          title: t.title ?? '(no title)',
          notes: t.notes ?? undefined,
          status: t.status === 'completed' ? 'completed' : 'open',
          starred: false,
          due: t.due ? Date.parse(t.due) : undefined,
          completedAt: t.completed ? Date.parse(t.completed) : undefined,
          position,
        });
      }
    }
    return tasks;
  }

  async createTask(task: Omit<Task, 'id' | 'position'>): Promise<Task> {
    const realList = task.listId.split(':').slice(1).join(':');
    const res = await this.tasks.tasks.insert({
      tasklist: realList,
      requestBody: {
        title: task.title,
        notes: task.notes,
        due: task.due ? new Date(task.due).toISOString() : undefined,
      },
    });
    return {
      ...task,
      id: `${this.account.id}:${realList}:${res.data.id}`,
      position: 0,
    };
  }

  async updateTask(task: Task): Promise<Task> {
    const [, realList, realId] = task.id.split(':');
    if (!realList || !realId) throw new Error('Invalid task id');
    await this.tasks.tasks.update({
      tasklist: realList,
      task: realId,
      requestBody: {
        id: realId,
        title: task.title,
        notes: task.notes,
        due: task.due ? new Date(task.due).toISOString() : undefined,
        status: task.status === 'completed' ? 'completed' : 'needsAction',
      },
    });
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    const [, realList, realId] = id.split(':');
    if (!realList || !realId) return;
    await this.tasks.tasks.delete({ tasklist: realList, task: realId });
  }
}

// ---- helpers ----

function mapLabelToRole(l: gmail_v1.Schema$Label): Folder['role'] {
  const id = (l.id ?? '').toUpperCase();
  if (id === 'INBOX') return 'inbox';
  if (id === 'SENT') return 'sent';
  if (id === 'DRAFT') return 'drafts';
  if (id === 'TRASH') return 'trash';
  if (id === 'SPAM') return 'spam';
  return 'custom';
}

function parseAddress(s: string): Address {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  if (m) return { name: (m[1] ?? '').trim() || undefined, email: m[2] ?? '' };
  return { email: s.trim() };
}

function parseAddressList(s?: string): Address[] {
  if (!s) return [];
  return s.split(',').map((p) => parseAddress(p));
}

function hasGmailAttachment(payload?: gmail_v1.Schema$MessagePart): boolean {
  if (!payload) return false;
  if (payload.filename && payload.filename.length > 0) return true;
  for (const p of payload.parts ?? []) {
    if (hasGmailAttachment(p)) return true;
  }
  return false;
}

function extractGmailBody(payload?: gmail_v1.Schema$MessagePart): { html?: string; text?: string } {
  const out: { html?: string; text?: string } = {};
  const walk = (p?: gmail_v1.Schema$MessagePart): void => {
    if (!p) return;
    const data = p.body?.data;
    if (data) {
      const decoded = Buffer.from(data, 'base64url').toString('utf8');
      if (p.mimeType === 'text/html' && !out.html) out.html = decoded;
      else if (p.mimeType === 'text/plain' && !out.text) out.text = decoded;
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  return out;
}

function extractGmailAttachments(payload?: gmail_v1.Schema$MessagePart): Message['attachments'] {
  const out: Message['attachments'] = [];
  let idx = 0;
  const walk = (p?: gmail_v1.Schema$MessagePart): void => {
    if (!p) return;
    idx += 1;
    if (p.filename) {
      out.push({
        partId: p.partId ?? String(idx),
        contentType: p.mimeType ?? 'application/octet-stream',
        filename: p.filename,
        size: p.body?.size ?? 0,
      });
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  return out;
}

function buildRfc822(draft: Draft, account: Account): string {
  const headers: string[] = [];
  headers.push(`From: ${account.displayName} <${account.emailAddress}>`);
  headers.push(`To: ${draft.to.map((a) => formatAddress(a)).join(', ')}`);
  if (draft.cc?.length) headers.push(`Cc: ${draft.cc.map(formatAddress).join(', ')}`);
  headers.push(`Subject: ${draft.subject}`);
  if (draft.inReplyTo) headers.push(`In-Reply-To: <${draft.inReplyTo}>`);
  if (draft.references?.length)
    headers.push(`References: ${draft.references.map((r) => `<${r}>`).join(' ')}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/html; charset=utf-8');
  const body = draft.bodyHtml ?? `<pre>${escapeHtml(draft.bodyText ?? '')}</pre>`;
  const raw = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return Buffer.from(raw).toString('base64url');
}

function formatAddress(a: Address): string {
  return a.name ? `"${a.name.replace(/"/g, '\\"')}" <${a.email}>` : a.email;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}

/**
 * Build the Google Calendar API request body for an event create/update.
 * Pure (no network) so it can be unit-tested. Includes attendees + reminder
 * overrides so invites are sent and reminders round-trip.
 */
export function buildGoogleEventBody(
  event: Omit<CalendarEvent, 'id'>,
): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: event.allDay
      ? { date: new Date(event.start).toISOString().slice(0, 10) }
      : { dateTime: new Date(event.start).toISOString() },
    end: event.allDay
      ? { date: new Date(event.end).toISOString().slice(0, 10) }
      : { dateTime: new Date(event.end).toISOString() },
  };
  if (event.attendees && event.attendees.length > 0) {
    body.attendees = event.attendees.map((a) => ({ email: a.email, displayName: a.name }));
  }
  if (event.reminders) {
    body.reminders = {
      useDefault: false,
      overrides: event.reminders.map((minutes) => ({ method: 'popup', minutes })),
    };
  }
  return body;
}

function toCalendarEvent(
  accountId: string,
  calendarId: string,
  e: calendar_v3.Schema$Event | undefined,
): CalendarEvent | undefined {
  if (!e || !e.id) return undefined;
  const startMs = e.start?.dateTime
    ? Date.parse(e.start.dateTime)
    : e.start?.date
      ? Date.parse(e.start.date)
      : NaN;
  const endMs = e.end?.dateTime
    ? Date.parse(e.end.dateTime)
    : e.end?.date
      ? Date.parse(e.end.date)
      : NaN;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return undefined;
  return {
    id: `${accountId}:${calendarId.split(':').slice(1).join(':')}:${e.id}`,
    calendarId,
    accountId,
    title: e.summary ?? '(no title)',
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    start: startMs,
    end: endMs,
    allDay: !!e.start?.date,
    status: (e.status as 'confirmed' | 'tentative' | 'cancelled') ?? 'confirmed',
    organizer: e.organizer?.email
      ? { name: e.organizer.displayName ?? undefined, email: e.organizer.email }
      : undefined,
    attendees: (e.attendees ?? [])
      .filter((a) => a.email)
      .map((a) => ({ name: a.displayName ?? undefined, email: a.email! })),
    reminders: (e.reminders?.overrides ?? [])
      .map((r) => r.minutes)
      .filter((m): m is number => typeof m === 'number'),
    recurrenceRule: e.recurrence?.[0] ?? undefined,
  };
}
