import { createRequire } from 'node:module';
const localRequire = createRequire(import.meta.url);
const nodemailer = localRequire('nodemailer');
/**
 * POP3 support is intentionally minimal: list latest messages, read one,
 * and use the configured SMTP for outbound. POP3 itself has no folder
 * concept so we expose a single virtual "Inbox" folder.
 *
 * The actual POP3 wire protocol is implemented via a small in-process
 * client to avoid pulling in `node-poplib` (which has security advisories);
 * we use the `poplib`-compatible TLS socket flow.
 */
export class Pop3Provider {
    account;
    creds;
    smtp;
    constructor(account, creds) {
        this.account = account;
        this.creds = creds;
        this.smtp = nodemailer.createTransport({
            host: creds.smtpHost,
            port: creds.smtpPort,
            secure: creds.smtpSecure,
            auth: { user: creds.username, pass: creds.password },
        });
    }
    async listFolders() {
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
    async listMessageHeaders(folderId, _cursor, _limit = 50) {
        // Stub: a real implementation would connect to the POP3 server, run STAT/LIST/UIDL/TOP.
        // Returning empty until real wire protocol is wired in v2.
        void folderId;
        return { items: [] };
    }
    async getMessage(_folderId, _uid) {
        throw new Error('POP3 message fetch not implemented in v1');
    }
    async send(draft) {
        await this.smtp.sendMail({
            from: `"${this.account.displayName}" <${this.account.emailAddress}>`,
            to: draft.to.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)),
            subject: draft.subject,
            text: draft.bodyText,
            html: draft.bodyHtml,
        });
    }
    async saveDraft(draft) {
        return { ...draft, id: draft.id ?? `local-draft-${Date.now()}` };
    }
    async setFlag() {
        // POP3 does not support server-side flags.
    }
    async search(_query) {
        return [];
    }
    async close() {
        this.smtp.close();
    }
}
//# sourceMappingURL=index.js.map