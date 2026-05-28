import { randomUUID } from 'node:crypto';
import { ImapSmtpProvider } from '@gingermail/providers';
export async function handleAccountAdd(ctx, input, opts = {}) {
    const id = `${input.kind}:${input.emailAddress}-${Date.now().toString(36)}`;
    const account = {
        id,
        kind: input.kind,
        displayName: input.displayName,
        emailAddress: input.emailAddress,
        createdAt: Date.now(),
        syncIntervalSec: 300,
        enabled: true,
    };
    if (input.kind === 'imap-smtp' || input.kind === 'apple-caldav') {
        if (!input.password)
            throw new Error('Password required');
        const cfg = imapSmtpDefaults(input);
        const creds = {
            imapHost: String(cfg.imapHost),
            imapPort: Number(cfg.imapPort),
            imapSecure: Boolean(cfg.imapSecure),
            smtpHost: String(cfg.smtpHost),
            smtpPort: Number(cfg.smtpPort),
            smtpSecure: Boolean(cfg.smtpSecure),
            username: input.username ?? input.emailAddress,
            password: input.password,
            emailAddress: input.emailAddress,
        };
        const probe = new ImapSmtpProvider(account, creds);
        try {
            await probe.listFolders();
        }
        finally {
            await probe.close();
        }
        if (opts.testOnly)
            return account;
        ctx.db.upsertAccount(account, JSON.stringify(cfg));
        ctx.vault.write(account.id, { password: input.password });
        return account;
    }
    if (input.kind === 'pop3') {
        if (!input.password)
            throw new Error('Password required');
        if (opts.testOnly)
            return account;
        const cfg = {
            pop3Host: input.pop3Host,
            pop3Port: input.pop3Port ?? 995,
            pop3Secure: input.pop3Secure ?? true,
            smtpHost: input.smtpHost,
            smtpPort: input.smtpPort ?? 587,
            smtpSecure: input.smtpSecure ?? false,
            username: input.username ?? input.emailAddress,
        };
        ctx.db.upsertAccount(account, JSON.stringify(cfg));
        ctx.vault.write(account.id, { password: input.password });
        return account;
    }
    if (input.kind === 'gmail' || input.kind === 'microsoft') {
        throw new Error('Use beginOAuth() for Gmail / Microsoft accounts');
    }
    throw new Error(`Unsupported account kind: ${input.kind}`);
}
function imapSmtpDefaults(input) {
    if (input.kind === 'apple-caldav') {
        return {
            imapHost: 'imap.mail.me.com',
            imapPort: 993,
            imapSecure: true,
            smtpHost: 'smtp.mail.me.com',
            smtpPort: 587,
            smtpSecure: false,
            username: input.username ?? input.emailAddress,
        };
    }
    return {
        imapHost: input.imapHost ?? '',
        imapPort: input.imapPort ?? 993,
        imapSecure: input.imapSecure ?? true,
        smtpHost: input.smtpHost ?? '',
        smtpPort: input.smtpPort ?? 587,
        smtpSecure: input.smtpSecure ?? false,
        username: input.username ?? input.emailAddress,
    };
}
void randomUUID;
//# sourceMappingURL=accountHandlers.js.map