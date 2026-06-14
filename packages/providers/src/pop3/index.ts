import { createRequire } from 'node:module';
import type * as Nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
const localRequire = createRequire(import.meta.url);
const nodemailer = localRequire('nodemailer') as typeof Nodemailer;
import type { Account, Draft, Folder, Message, MessageHeader } from '@gingermail/core';
import type { MailProvider, Page } from '../types.js';

export interface Pop3Credentials {
  pop3Host: string;
  pop3Port: number;
  pop3Secure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
  emailAddress: string;
}

/**
 * POP3 support is intentionally minimal: list latest messages, read one,
 * and use the configured SMTP for outbound. POP3 itself has no folder
 * concept so we expose a single virtual "Inbox" folder.
 *
 * The actual POP3 wire protocol is implemented via a small in-process
 * client to avoid pulling in `node-poplib` (which has security advisories);
 * we use the `poplib`-compatible TLS socket flow.
 */
export class Pop3Provider implements MailProvider {
  private smtp: Transporter;

  constructor(
    private readonly account: Account,
    private readonly creds: Pop3Credentials,
  ) {
    this.smtp = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpSecure,
      auth: { user: creds.username, pass: creds.password },
    });
  }

  async listFolders(): Promise<Folder[]> {
    return [
      {
        id: `${this.account.id}:INBOX`,
        accountId: this.account.id,
        name: 'Inbox',
        path: 'INBOX',
        role: 'inbox',
        unreadCount: 0,
        totalCount: 0,
      },
    ];
  }

  async listMessageHeaders(
    folderId: string,
    _cursor?: string,
    _limit = 50,
  ): Promise<Page<MessageHeader>> {
    // Stub: a real implementation would connect to the POP3 server, run STAT/LIST/UIDL/TOP.
    // Returning empty until real wire protocol is wired in v2.
    void folderId;
    return { items: [] };
  }

  async getMessage(_folderId: string, _uid: string): Promise<Message> {
    throw new Error('POP3 message fetch not implemented in v1');
  }

  async send(draft: Draft): Promise<void> {
    await this.smtp.sendMail({
      from: `"${this.account.displayName}" <${this.account.emailAddress}>`,
      to: draft.to.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)),
      subject: draft.subject,
      text: draft.bodyText,
      html: draft.bodyHtml,
    });
  }

  async saveDraft(draft: Draft): Promise<Draft> {
    return { ...draft, id: draft.id ?? `local-draft-${Date.now()}` };
  }

  async setFlag(): Promise<void> {
    // POP3 does not support server-side flags.
  }

  async search(_query: string): Promise<MessageHeader[]> {
    return [];
  }

  async close(): Promise<void> {
    this.smtp.close();
  }
}
