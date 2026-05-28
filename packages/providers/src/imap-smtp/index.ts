import { createRequire } from 'node:module';
import type { ImapFlow as ImapFlowType } from 'imapflow';
import type { Transporter } from 'nodemailer';
const localRequire = createRequire(import.meta.url);
const { ImapFlow } = localRequire('imapflow') as { ImapFlow: typeof ImapFlowType };
const nodemailer = localRequire('nodemailer') as typeof import('nodemailer');
import type {
  Account,
  Address,
  Draft,
  Folder,
  FolderRole,
  Message,
  MessageHeader,
} from '@gingermail/core';
import type { MailEvent, MailProvider, Page, Unsubscribe } from '../types.js';
import { parseListUnsubscribe } from '../unsubscribe.js';

export interface ImapSmtpCredentials {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
  emailAddress: string;
}

const FOLDER_ROLE_MAP: Record<string, FolderRole> = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Trash': 'trash',
  '\\Junk': 'spam',
  '\\Archive': 'archive',
  '\\All': 'all',
};

export class ImapSmtpProvider implements MailProvider {
  private imap: ImapFlowType;
  private smtp: Transporter;
  private connected = false;

  constructor(
    private readonly account: Account,
    private readonly creds: ImapSmtpCredentials,
  ) {
    this.imap = new ImapFlow({
      host: creds.imapHost,
      port: creds.imapPort,
      secure: creds.imapSecure,
      auth: { user: creds.username, pass: creds.password },
      logger: false,
    });
    this.smtp = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpSecure,
      auth: { user: creds.username, pass: creds.password },
    });
  }

  private async ensure(): Promise<void> {
    if (!this.connected) {
      await this.imap.connect();
      this.connected = true;
    }
  }

  async listFolders(): Promise<Folder[]> {
    await this.ensure();
    const list = await this.imap.list();
    return list.map((m) => {
      const fromMap = m.specialUse ? FOLDER_ROLE_MAP[m.specialUse] : undefined;
      const role: FolderRole = fromMap ?? 'custom';
      const status = m.status ?? { messages: 0, unseen: 0 };
      return {
        id: `${this.account.id}:${m.path}`,
        accountId: this.account.id,
        name: m.name,
        path: m.path,
        role,
        unreadCount: status.unseen ?? 0,
        totalCount: status.messages ?? 0,
      };
    });
  }

  async listMessageHeaders(folderId: string, cursor?: string, limit = 100): Promise<Page<MessageHeader>> {
    await this.ensure();
    const path = folderIdToPath(folderId);
    const lock = await this.imap.getMailboxLock(path);
    try {
      const status = await this.imap.status(path, { messages: true, uidNext: true });
      const total = status.messages ?? 0;
      const startSeq = cursor ? Math.max(1, parseInt(cursor, 10) - limit) : Math.max(1, total - limit + 1);
      const endSeq = cursor ? parseInt(cursor, 10) - 1 : total;
      if (total === 0 || endSeq < 1) return { items: [] };

      const headers: MessageHeader[] = [];
      for await (const msg of this.imap.fetch(
        `${startSeq}:${endSeq}`,
        { envelope: true, flags: true, internalDate: true, uid: true, bodyStructure: true },
      )) {
        headers.push(this.toHeader(folderId, asFetched(msg)));
      }
      headers.sort((a, b) => b.date - a.date);
      return {
        items: headers,
        nextCursor: startSeq > 1 ? String(startSeq) : undefined,
      };
    } finally {
      lock.release();
    }
  }

  async getMessage(folderId: string, uid: string): Promise<Message> {
    await this.ensure();
    const path = folderIdToPath(folderId);
    const lock = await this.imap.getMailboxLock(path);
    try {
      const msg = await this.imap.fetchOne(uid, {
        source: true,
        envelope: true,
        flags: true,
        internalDate: true,
        uid: true,
        bodyStructure: true,
      }, { uid: true });
      if (!msg) throw new Error(`Message uid=${uid} not found`);
      const header = this.toHeader(folderId, asFetched(msg));
      const { parseRfc822 } = await import('./parser.js');
      const parsed = await parseRfc822(msg.source as Buffer);
      const lu = parseListUnsubscribe(
        parsed.headers?.['list-unsubscribe'] ?? parsed.headers?.['List-Unsubscribe'],
        parsed.headers?.['list-unsubscribe-post'] ?? parsed.headers?.['List-Unsubscribe-Post'],
      );
      return {
        ...header,
        body: {
          html: parsed.html,
          text: parsed.text,
        },
        attachments: parsed.attachments,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        rawHeaders: parsed.headers,
        listUnsubscribeHttp: lu.http,
        listUnsubscribeMailto: lu.mailto,
        listUnsubscribePost: lu.oneClick,
      };
    } finally {
      lock.release();
    }
  }

  async send(draft: Draft): Promise<void> {
    await this.smtp.sendMail({
      from: `"${this.account.displayName}" <${this.account.emailAddress}>`,
      to: draft.to.map(addrToString),
      cc: draft.cc?.map(addrToString),
      bcc: draft.bcc?.map(addrToString),
      subject: draft.subject,
      text: draft.bodyText,
      html: draft.bodyHtml,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      attachments: draft.attachments?.map((a) => ({ filename: a.filename, path: a.path })),
    });
  }

  async saveDraft(draft: Draft): Promise<Draft> {
    return { ...draft, id: draft.id ?? `local-draft-${Date.now()}` };
  }

  async setFlag(input: { folderId: string; uid: string; flag: 'read' | 'unread' | 'star' | 'unstar' }): Promise<void> {
    await this.ensure();
    const path = folderIdToPath(input.folderId);
    const lock = await this.imap.getMailboxLock(path);
    try {
      const flagMap: Record<typeof input.flag, { add?: string[]; remove?: string[] }> = {
        read: { add: ['\\Seen'] },
        unread: { remove: ['\\Seen'] },
        star: { add: ['\\Flagged'] },
        unstar: { remove: ['\\Flagged'] },
      };
      const op = flagMap[input.flag];
      if (op.add) await this.imap.messageFlagsAdd(input.uid, op.add, { uid: true });
      if (op.remove) await this.imap.messageFlagsRemove(input.uid, op.remove, { uid: true });
    } finally {
      lock.release();
    }
  }

  async moveMessage(input: { fromFolderId: string; toFolderId: string; uid: string }): Promise<{ uid: string }> {
    await this.ensure();
    const fromPath = folderIdToPath(input.fromFolderId);
    const toPath = folderIdToPath(input.toFolderId);
    const lock = await this.imap.getMailboxLock(fromPath);
    try {
      const res = await this.imap.messageMove(input.uid, toPath, { uid: true }) as
        | { uidMap?: Map<number | string, number | string> }
        | undefined;
      // ImapFlow returns uidMap mapping source UIDs to destination UIDs when
      // the server supports UIDPLUS; fall back to the source uid otherwise.
      const newUid = res?.uidMap?.get(Number(input.uid)) ?? res?.uidMap?.get(input.uid);
      return { uid: newUid !== undefined ? String(newUid) : input.uid };
    } finally {
      lock.release();
    }
  }

  async reportSpam(input: { folderId: string; uid: string }): Promise<void> {
    // IMAP has no standardised "report spam" verb; junking is a folder move.
    // Find the account's \Junk folder and move into it.
    const folders = await this.listFolders();
    const spam = folders.find((f) => f.role === 'spam');
    if (!spam) throw new Error('No spam folder configured for this account.');
    await this.moveMessage({ fromFolderId: input.folderId, toFolderId: spam.id, uid: input.uid });
  }

  async search(query: string): Promise<MessageHeader[]> {
    await this.ensure();
    const folders = await this.listFolders();
    const inbox = folders.find((f) => f.role === 'inbox') ?? folders[0];
    if (!inbox) return [];
    const path = folderIdToPath(inbox.id);
    const lock = await this.imap.getMailboxLock(path);
    try {
      const uids = await this.imap.search(
        { or: [{ subject: query }, { body: query }, { from: query }] },
        { uid: true },
      );
      if (!uids || uids.length === 0) return [];
      const results: MessageHeader[] = [];
      for await (const msg of this.imap.fetch(uids, {
        envelope: true,
        flags: true,
        internalDate: true,
        uid: true,
        bodyStructure: true,
      })) {
        results.push(this.toHeader(inbox.id, asFetched(msg)));
      }
      return results;
    } finally {
      lock.release();
    }
  }

  watch(folderId: string, cb: (evt: MailEvent) => void): Unsubscribe {
    const onExists = async (data: { count: number; prevCount: number; path: string }) => {
      if (data.path !== folderIdToPath(folderId)) return;
      cb({ kind: 'new', folderId, messageId: `exists:${data.count}` });
    };
    this.imap.on('exists', onExists);
    return () => {
      this.imap.off('exists', onExists);
    };
  }

  async close(): Promise<void> {
    try {
      if (this.connected) await this.imap.logout();
    } catch {
      // ignore
    }
    this.smtp.close();
  }

  private toHeader(folderId: string, msg: ImapFetchedMessage): MessageHeader {
    const env = msg.envelope ?? {};
    const from: Address = pickAddress(env.from?.[0]) ?? { email: '' };
    const to: Address[] = (env.to ?? []).map(pickAddress).filter(Boolean) as Address[];
    const cc: Address[] | undefined = env.cc?.length ? (env.cc.map(pickAddress).filter(Boolean) as Address[]) : undefined;
    const flags = new Set<string>([...(msg.flags ?? [])]);
    const subject = (env.subject ?? '').toString();
    return {
      id: `${this.account.id}:${folderId}:${msg.uid}`,
      accountId: this.account.id,
      folderId,
      threadId: env.inReplyTo || env.messageId || `${msg.uid}`,
      uid: String(msg.uid),
      from,
      to,
      cc,
      subject,
      snippet: subject.slice(0, 140),
      date: (msg.internalDate ?? env.date ?? new Date()).valueOf(),
      unread: !flags.has('\\Seen'),
      flagged: flags.has('\\Flagged'),
      hasAttachments: hasAttachments(msg.bodyStructure),
      labels: [],
    };
  }
}

function folderIdToPath(folderId: string): string {
  const colon = folderId.indexOf(':');
  return colon === -1 ? folderId : folderId.slice(colon + 1);
}

export function addrToString(a: Address): string {
  return a.name ? `"${a.name.replace(/"/g, '\\"')}" <${a.email}>` : a.email;
}

/**
 * Normalises an ImapFlow `FetchMessageObject` to the shape our `toHeader` expects.
 * The library exposes `flags` as a `Set<string>` and `source` as `Buffer`; our
 * internal type uses arrays so that JSON round-tripping just works.
 */
function asFetched(msg: unknown): ImapFetchedMessage {
  const m = msg as {
    uid: number;
    envelope?: ImapFetchedMessage['envelope'];
    flags?: Set<string> | string[];
    internalDate?: Date;
    source?: Buffer;
    bodyStructure?: unknown;
  };
  return {
    uid: m.uid,
    envelope: m.envelope,
    flags: m.flags instanceof Set ? Array.from(m.flags) : (m.flags as string[] | undefined),
    internalDate: m.internalDate,
    source: m.source,
    bodyStructure: m.bodyStructure,
  };
}

function pickAddress(a?: { name?: string; address?: string }): Address | undefined {
  if (!a || !a.address) return undefined;
  return { name: a.name, email: a.address };
}

interface ImapFetchedMessage {
  uid: number;
  envelope?: {
    from?: { name?: string; address?: string }[];
    to?: { name?: string; address?: string }[];
    cc?: { name?: string; address?: string }[];
    subject?: string | null;
    date?: Date | null;
    inReplyTo?: string | null;
    messageId?: string | null;
  };
  flags?: string[];
  internalDate?: Date;
  source?: Buffer;
  bodyStructure?: unknown;
}

function hasAttachments(bodyStructure: unknown): boolean {
  if (!bodyStructure || typeof bodyStructure !== 'object') return false;
  const bs = bodyStructure as { disposition?: string; childNodes?: unknown[] };
  if (bs.disposition === 'attachment') return true;
  if (Array.isArray(bs.childNodes)) {
    return bs.childNodes.some((c) => hasAttachments(c));
  }
  return false;
}
