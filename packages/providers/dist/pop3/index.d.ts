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
export declare class Pop3Provider implements MailProvider {
    private readonly account;
    private readonly creds;
    private smtp;
    constructor(account: Account, creds: Pop3Credentials);
    listFolders(): Promise<Folder[]>;
    listMessageHeaders(folderId: string, _cursor?: string, _limit?: number): Promise<Page<MessageHeader>>;
    getMessage(_folderId: string, _uid: string): Promise<Message>;
    send(draft: Draft): Promise<void>;
    saveDraft(draft: Draft): Promise<Draft>;
    setFlag(): Promise<void>;
    search(_query: string): Promise<MessageHeader[]>;
    close(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map