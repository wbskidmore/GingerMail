import { createRequire } from 'node:module';
import type { Client as GraphClientType, AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import type { PublicClientApplication as PublicClientApplicationType, AuthenticationResult } from '@azure/msal-node';

// Both modules are CJS; static `import` from this ESM file crashes the Electron 32
// main process via Node 20.18's CJS/ESM interop bug. Load via createRequire.
const localRequire = createRequire(import.meta.url);
const { Client: GraphClient } = localRequire('@microsoft/microsoft-graph-client') as { Client: typeof GraphClientType };
const { PublicClientApplication } = localRequire('@azure/msal-node') as { PublicClientApplication: typeof PublicClientApplicationType };
import type {
  Account,
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

/**
 * Minimum-viable Microsoft Graph scope set. Adding a scope triggers
 * re-consent for every existing user — only do it for a real feature need
 * and document it on the line itself.
 *
 * Conscious omissions:
 *   - `Mail.Read`         redundant once `Mail.ReadWrite` is present.
 *   - `Calendars.Read`    redundant once `Calendars.ReadWrite` is present.
 *   - `Mail.ReadWrite.All` enterprise-tenant scope; never used (we only
 *                          touch the signed-in user's mailbox).
 *   - `Contacts.Read`     not requested; contact suggestions come from
 *                          per-message To/Cc/Bcc parsing instead.
 *   - `profile`           not requested; the access token already includes
 *                          username and displayName via MSAL's `account`.
 */
export const MICROSOFT_SCOPES = [
  // Needed so the refresh token actually appears in the response.
  'offline_access',
  // Profile email/name for account labeling.
  'User.Read',
  // Read + write mail (archive, move, flag, mark read/unread).
  'Mail.ReadWrite',
  // Sending mail (Reply / Reply All / Forward / Compose).
  'Mail.Send',
  // Calendar events tab.
  'Calendars.ReadWrite',
  // Tasks tab.
  'Tasks.ReadWrite',
];

export interface MicrosoftTokens {
  homeAccountId: string;
  accessToken: string;
  refreshToken?: string;
  expiresOn?: number;
}

export function buildMsalApp(clientId: string, tenant = 'common'): PublicClientApplicationType {
  return new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
  });
}

export function authProviderFromToken(token: string): AuthenticationProvider {
  return { getAccessToken: async () => token };
}

export class MicrosoftMailProvider implements MailProvider {
  private client: GraphClientType;
  constructor(private readonly account: Account, accessToken: string) {
    this.client = GraphClient.initWithMiddleware({ authProvider: authProviderFromToken(accessToken) });
  }

  async listFolders(): Promise<Folder[]> {
    const res = await this.client.api('/me/mailFolders').top(100).get();
    return (res.value ?? []).map((f: GraphMailFolder) => ({
      id: `${this.account.id}:${f.id}`,
      accountId: this.account.id,
      name: f.displayName,
      path: f.id,
      role: mapGraphFolderRole(f.displayName),
      unreadCount: f.unreadItemCount ?? 0,
      totalCount: f.totalItemCount ?? 0,
    }));
  }

  async listMessageHeaders(folderId: string, cursor?: string, limit = 50): Promise<Page<MessageHeader>> {
    const realFolder = folderId.split(':').slice(1).join(':');
    const req = this.client
      .api(`/me/mailFolders/${realFolder}/messages`)
      .top(limit)
      .select('id,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isRead,flag,hasAttachments,conversationId')
      .orderby('receivedDateTime desc');
    if (cursor) req.skip(parseInt(cursor, 10) || 0);
    const res = await req.get();
    const items = (res.value ?? []).map((m: GraphMessage) => this.toHeader(folderId, m));
    return {
      items,
      nextCursor: items.length === limit ? String((parseInt(cursor ?? '0', 10) || 0) + limit) : undefined,
    };
  }

  async getMessage(folderId: string, uid: string): Promise<Message> {
    // Microsoft Graph hides custom internet message headers behind `?$select=internetMessageHeaders`.
    const m: GraphMessage = await this.client
      .api(`/me/messages/${uid}`)
      .select('id,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isRead,flag,hasAttachments,conversationId,body,internetMessageHeaders')
      .get();
    const header = this.toHeader(folderId, m);
    const ih = (m as { internetMessageHeaders?: Array<{ name: string; value: string }> }).internetMessageHeaders ?? [];
    const headerMap = new Map<string, string>();
    for (const h of ih) headerMap.set(h.name.toLowerCase(), h.value);
    const lu = parseListUnsubscribe(headerMap.get('list-unsubscribe'), headerMap.get('list-unsubscribe-post'));
    return {
      ...header,
      body: {
        html: m.body?.contentType === 'html' ? m.body?.content : undefined,
        text: m.body?.contentType !== 'html' ? m.body?.content : undefined,
      },
      attachments: [],
      listUnsubscribeHttp: lu.http,
      listUnsubscribeMailto: lu.mailto,
      listUnsubscribePost: lu.oneClick,
    };
  }

  async send(draft: Draft): Promise<void> {
    await this.client.api('/me/sendMail').post({
      message: {
        subject: draft.subject,
        body: { contentType: 'HTML', content: draft.bodyHtml ?? draft.bodyText ?? '' },
        toRecipients: draft.to.map((a) => ({ emailAddress: { name: a.name, address: a.email } })),
        ccRecipients: draft.cc?.map((a) => ({ emailAddress: { name: a.name, address: a.email } })),
        bccRecipients: draft.bcc?.map((a) => ({ emailAddress: { name: a.name, address: a.email } })),
      },
      saveToSentItems: true,
    });
  }

  async saveDraft(draft: Draft): Promise<Draft> {
    const res = await this.client.api('/me/messages').post({
      subject: draft.subject,
      body: { contentType: 'HTML', content: draft.bodyHtml ?? draft.bodyText ?? '' },
      toRecipients: draft.to.map((a) => ({ emailAddress: { name: a.name, address: a.email } })),
    });
    return { ...draft, id: res.id };
  }

  async setFlag(input: { folderId: string; uid: string; flag: 'read' | 'unread' | 'star' | 'unstar' }): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (input.flag === 'read') patch.isRead = true;
    if (input.flag === 'unread') patch.isRead = false;
    if (input.flag === 'star') patch.flag = { flagStatus: 'flagged' };
    if (input.flag === 'unstar') patch.flag = { flagStatus: 'notFlagged' };
    await this.client.api(`/me/messages/${input.uid}`).patch(patch);
  }

  async moveMessage(input: { fromFolderId: string; toFolderId: string; uid: string }): Promise<{ uid: string }> {
    const destinationId = input.toFolderId.split(':').slice(1).join(':');
    const res = await this.client
      .api(`/me/messages/${input.uid}/move`)
      .post({ destinationId }) as { id?: string };
    return { uid: res.id ?? input.uid };
  }

  async reportSpam(input: { folderId: string; uid: string }): Promise<void> {
    // Graph doesn't have a dedicated "report" endpoint exposed to apps; the
    // move-into-junk action is what the Outlook clients do, and it triggers
    // server-side spam learning.
    await this.client.api(`/me/messages/${input.uid}/move`).post({ destinationId: 'junkemail' });
  }

  async search(query: string): Promise<MessageHeader[]> {
    const res = await this.client.api(`/me/messages`).search(`"${query}"`).top(50).get();
    return (res.value ?? []).map((m: GraphMessage) => this.toHeader(`${this.account.id}:SEARCH`, m));
  }

  async close(): Promise<void> {
    // graph client has no persistent connection
  }

  private toHeader(folderId: string, m: GraphMessage): MessageHeader {
    return {
      id: `${this.account.id}:${m.id}`,
      accountId: this.account.id,
      folderId,
      threadId: m.conversationId ?? m.id,
      uid: m.id,
      from: m.from?.emailAddress
        ? { name: m.from.emailAddress.name, email: m.from.emailAddress.address ?? '' }
        : { email: '' },
      to: (m.toRecipients ?? []).map((r) => ({ name: r.emailAddress?.name, email: r.emailAddress?.address ?? '' })),
      cc: (m.ccRecipients ?? []).map((r) => ({ name: r.emailAddress?.name, email: r.emailAddress?.address ?? '' })),
      subject: m.subject ?? '',
      snippet: (m.bodyPreview ?? '').slice(0, 200),
      date: m.receivedDateTime ? Date.parse(m.receivedDateTime) : Date.now(),
      unread: !m.isRead,
      flagged: m.flag?.flagStatus === 'flagged',
      hasAttachments: !!m.hasAttachments,
      labels: [],
    };
  }
}

export class MicrosoftCalendarProvider implements CalendarProvider {
  private client: GraphClientType;
  constructor(private readonly account: Account, accessToken: string) {
    this.client = GraphClient.initWithMiddleware({ authProvider: authProviderFromToken(accessToken) });
  }

  async listCalendars(): Promise<Calendar[]> {
    const res = await this.client.api('/me/calendars').get();
    return (res.value ?? []).map((c: GraphCalendar) => ({
      id: `${this.account.id}:${c.id}`,
      accountId: this.account.id,
      name: c.name,
      color: c.hexColor || '#3b82f6',
      readonly: !c.canEdit,
      primary: !!c.isDefaultCalendar,
    }));
  }

  async listEvents(input: { from: number; to: number; calendarIds?: string[] }): Promise<CalendarEvent[]> {
    const cals = input.calendarIds ?? (await this.listCalendars()).map((c) => c.id);
    const out: CalendarEvent[] = [];
    for (const calId of cals) {
      const realId = calId.split(':').slice(1).join(':');
      const res = await this.client
        .api(`/me/calendars/${realId}/calendarView`)
        .query({ startDateTime: new Date(input.from).toISOString(), endDateTime: new Date(input.to).toISOString() })
        .top(1000)
        .get();
      for (const e of res.value ?? []) {
        const evt = toGraphEvent(this.account.id, calId, e);
        if (evt) out.push(evt);
      }
    }
    return out;
  }

  async createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    const realId = event.calendarId.split(':').slice(1).join(':');
    const res = await this.client.api(`/me/calendars/${realId}/events`).post({
      subject: event.title,
      body: { contentType: 'text', content: event.description ?? '' },
      start: { dateTime: new Date(event.start).toISOString(), timeZone: 'UTC' },
      end: { dateTime: new Date(event.end).toISOString(), timeZone: 'UTC' },
      location: { displayName: event.location ?? '' },
    });
    return toGraphEvent(this.account.id, event.calendarId, res) ?? { ...event, id: res.id };
  }

  async updateEvent(event: CalendarEvent): Promise<CalendarEvent> {
    const realId = event.id.split(':').slice(2).join(':');
    await this.client.api(`/me/events/${realId}`).patch({
      subject: event.title,
      body: { contentType: 'text', content: event.description ?? '' },
      start: { dateTime: new Date(event.start).toISOString(), timeZone: 'UTC' },
      end: { dateTime: new Date(event.end).toISOString(), timeZone: 'UTC' },
      location: { displayName: event.location ?? '' },
    });
    return event;
  }

  async deleteEvent(id: string): Promise<void> {
    const realId = id.split(':').slice(2).join(':');
    await this.client.api(`/me/events/${realId}`).delete();
  }
}

export class MicrosoftTasksProvider implements TaskProvider {
  private client: GraphClientType;
  constructor(private readonly account: Account, accessToken: string) {
    this.client = GraphClient.initWithMiddleware({ authProvider: authProviderFromToken(accessToken) });
  }

  async listLists(): Promise<TaskList[]> {
    const res = await this.client.api('/me/todo/lists').get();
    return (res.value ?? []).map((l: GraphTodoList) => ({
      id: `${this.account.id}:${l.id}`,
      accountId: this.account.id,
      name: l.displayName,
    }));
  }

  async listTasks(listId?: string): Promise<Task[]> {
    const lists = listId ? [{ id: listId } as TaskList] : await this.listLists();
    const out: Task[] = [];
    let position = 0;
    for (const l of lists) {
      const realId = l.id.split(':').slice(1).join(':');
      const res = await this.client.api(`/me/todo/lists/${realId}/tasks`).get();
      for (const t of res.value ?? []) {
        position += 1;
        out.push({
          id: `${this.account.id}:${realId}:${t.id}`,
          listId: l.id,
          accountId: this.account.id,
          title: t.title ?? '(no title)',
          notes: t.body?.content ?? undefined,
          status: t.status === 'completed' ? 'completed' : 'open',
          starred: t.importance === 'high',
          due: t.dueDateTime?.dateTime ? Date.parse(t.dueDateTime.dateTime) : undefined,
          completedAt: t.completedDateTime?.dateTime ? Date.parse(t.completedDateTime.dateTime) : undefined,
          position,
        });
      }
    }
    return out;
  }

  async createTask(task: Omit<Task, 'id' | 'position'>): Promise<Task> {
    const realList = task.listId.split(':').slice(1).join(':');
    const res = await this.client.api(`/me/todo/lists/${realList}/tasks`).post({
      title: task.title,
      body: { content: task.notes ?? '', contentType: 'text' },
      dueDateTime: task.due ? { dateTime: new Date(task.due).toISOString(), timeZone: 'UTC' } : undefined,
      importance: task.starred ? 'high' : 'normal',
    });
    return { ...task, id: `${this.account.id}:${realList}:${res.id}`, position: 0 };
  }

  async updateTask(task: Task): Promise<Task> {
    const [, realList, realId] = task.id.split(':');
    if (!realList || !realId) throw new Error('Invalid task id');
    await this.client.api(`/me/todo/lists/${realList}/tasks/${realId}`).patch({
      title: task.title,
      body: { content: task.notes ?? '', contentType: 'text' },
      dueDateTime: task.due ? { dateTime: new Date(task.due).toISOString(), timeZone: 'UTC' } : undefined,
      status: task.status === 'completed' ? 'completed' : 'notStarted',
      importance: task.starred ? 'high' : 'normal',
    });
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    const [, realList, realId] = id.split(':');
    if (!realList || !realId) return;
    await this.client.api(`/me/todo/lists/${realList}/tasks/${realId}`).delete();
  }
}

// --- helpers ---

function mapGraphFolderRole(name?: string): Folder['role'] {
  const n = (name ?? '').toLowerCase();
  if (n === 'inbox') return 'inbox';
  if (n === 'sent items') return 'sent';
  if (n === 'drafts') return 'drafts';
  if (n === 'deleted items') return 'trash';
  if (n === 'junk email') return 'spam';
  if (n === 'archive') return 'archive';
  return 'custom';
}

function toGraphEvent(accountId: string, calendarId: string, e: GraphEvent | undefined): CalendarEvent | undefined {
  if (!e || !e.id) return undefined;
  const start = e.start?.dateTime ? Date.parse(e.start.dateTime + 'Z') : NaN;
  const end = e.end?.dateTime ? Date.parse(e.end.dateTime + 'Z') : NaN;
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
  return {
    id: `${accountId}:${calendarId.split(':').slice(1).join(':')}:${e.id}`,
    calendarId,
    accountId,
    title: e.subject ?? '(no title)',
    description: e.bodyPreview ?? e.body?.content ?? undefined,
    location: e.location?.displayName ?? undefined,
    start,
    end,
    allDay: !!e.isAllDay,
    status: 'confirmed',
  };
}

interface GraphMailFolder {
  id: string;
  displayName: string;
  unreadItemCount?: number;
  totalItemCount?: number;
}

interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: 'text' | 'html'; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: 'notFlagged' | 'flagged' };
  hasAttachments?: boolean;
  conversationId?: string;
}

interface GraphCalendar {
  id: string;
  name: string;
  hexColor?: string;
  canEdit?: boolean;
  isDefaultCalendar?: boolean;
}

interface GraphEvent {
  id: string;
  subject?: string;
  body?: { content?: string };
  bodyPreview?: string;
  location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  isAllDay?: boolean;
}

interface GraphTodoList {
  id: string;
  displayName: string;
}

void {} as unknown as AuthenticationResult; // keep type import alive for downstream consumers

/** Re-export class type from msal to keep external API stable. */
export type MsalApp = ReturnType<typeof buildMsalApp>;
