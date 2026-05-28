import type { Account, Address, Draft, Folder, Message, MessageHeader } from '@gingermail/core';
import type { MailEvent, MailProvider, Page, Unsubscribe } from '../types.js';
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
export declare class ImapSmtpProvider implements MailProvider {
    private readonly account;
    private readonly creds;
    private imap;
    private smtp;
    private connected;
    constructor(account: Account, creds: ImapSmtpCredentials);
    private ensure;
    listFolders(): Promise<Folder[]>;
    listMessageHeaders(folderId: string, cursor?: string, limit?: number): Promise<Page<MessageHeader>>;
    getMessage(folderId: string, uid: string): Promise<Message>;
    send(draft: Draft): Promise<void>;
    saveDraft(draft: Draft): Promise<Draft>;
    setFlag(input: {
        folderId: string;
        uid: string;
        flag: 'read' | 'unread' | 'star' | 'unstar';
    }): Promise<void>;
    moveMessage(input: {
        fromFolderId: string;
        toFolderId: string;
        uid: string;
    }): Promise<{
        uid: string;
    }>;
    reportSpam(input: {
        folderId: string;
        uid: string;
    }): Promise<void>;
    search(query: string): Promise<MessageHeader[]>;
    watch(folderId: string, cb: (evt: MailEvent) => void): Unsubscribe;
    close(): Promise<void>;
    private toHeader;
}
export declare function addrToString(a: Address): string;
//# sourceMappingURL=index.d.ts.map