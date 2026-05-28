/**
 * Zod schemas for IPC channel inputs that either MUTATE state, EGRESS
 * to the network, or CONSUME a path / URL the renderer supplied.
 *
 * Read-only channels (mailListFolders, mailGetMessage, …) intentionally
 * remain unvalidated; their inputs are small strings whose worst case is
 * a SQL bind-param mismatch.
 *
 * Each schema is exported under the SAME NAME as the channel constant so
 * the register.ts side can grep-and-pair them. Adding a new write-path
 * channel WITHOUT also adding a schema here will fail the
 * `coverage.test.ts` audit below.
 */
import { z } from 'zod';
export declare const SettingsUpdateSchema: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
export declare const AccountIdSchema: z.ZodString;
export declare const AddAccountInputSchema: z.ZodObject<{
    kind: z.ZodEnum<["gmail", "microsoft", "imap-smtp", "pop3", "apple-caldav"]>;
    displayName: z.ZodOptional<z.ZodString>;
    emailAddress: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    kind: z.ZodEnum<["gmail", "microsoft", "imap-smtp", "pop3", "apple-caldav"]>;
    displayName: z.ZodOptional<z.ZodString>;
    emailAddress: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    kind: z.ZodEnum<["gmail", "microsoft", "imap-smtp", "pop3", "apple-caldav"]>;
    displayName: z.ZodOptional<z.ZodString>;
    emailAddress: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export declare const OAuthKindSchema: z.ZodEnum<["gmail", "microsoft"]>;
export declare const MailSendSchema: z.ZodObject<{
    accountId: z.ZodString;
    to: z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        name?: string | undefined;
    }, {
        email: string;
        name?: string | undefined;
    }>, "many">;
    cc: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        name?: string | undefined;
    }, {
        email: string;
        name?: string | undefined;
    }>, "many">>;
    bcc: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        name?: string | undefined;
    }, {
        email: string;
        name?: string | undefined;
    }>, "many">>;
    subject: z.ZodOptional<z.ZodString>;
    body: z.ZodString;
    html: z.ZodOptional<z.ZodString>;
    inReplyTo: z.ZodOptional<z.ZodString>;
    references: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        mimeType: z.ZodString;
        sizeBytes: z.ZodNumber;
        contentBase64: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        filename: string;
        mimeType: string;
        sizeBytes: number;
        contentBase64: string;
    }, {
        filename: string;
        mimeType: string;
        sizeBytes: number;
        contentBase64: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    accountId: string;
    body: string;
    to: {
        email: string;
        name?: string | undefined;
    }[];
    attachments?: {
        filename: string;
        mimeType: string;
        sizeBytes: number;
        contentBase64: string;
    }[] | undefined;
    subject?: string | undefined;
    cc?: {
        email: string;
        name?: string | undefined;
    }[] | undefined;
    bcc?: {
        email: string;
        name?: string | undefined;
    }[] | undefined;
    html?: string | undefined;
    inReplyTo?: string | undefined;
    references?: string[] | undefined;
}, {
    accountId: string;
    body: string;
    to: {
        email: string;
        name?: string | undefined;
    }[];
    attachments?: {
        filename: string;
        mimeType: string;
        sizeBytes: number;
        contentBase64: string;
    }[] | undefined;
    subject?: string | undefined;
    cc?: {
        email: string;
        name?: string | undefined;
    }[] | undefined;
    bcc?: {
        email: string;
        name?: string | undefined;
    }[] | undefined;
    html?: string | undefined;
    inReplyTo?: string | undefined;
    references?: string[] | undefined;
}>;
export declare const MailSaveDraftSchema: z.ZodObject<{
    accountId: z.ZodString;
    to: z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        name?: string | undefined;
    }, {
        email: string;
        name?: string | undefined;
    }>, "many">;
    cc: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        name?: string | undefined;
    }, {
        email: string;
        name?: string | undefined;
    }>, "many">>;
    bcc: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        name?: string | undefined;
    }, {
        email: string;
        name?: string | undefined;
    }>, "many">>;
    subject: z.ZodOptional<z.ZodString>;
    body: z.ZodString;
    html: z.ZodOptional<z.ZodString>;
    inReplyTo: z.ZodOptional<z.ZodString>;
    references: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        mimeType: z.ZodString;
        sizeBytes: z.ZodNumber;
        contentBase64: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        filename: string;
        mimeType: string;
        sizeBytes: number;
        contentBase64: string;
    }, {
        filename: string;
        mimeType: string;
        sizeBytes: number;
        contentBase64: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    accountId: string;
    body: string;
    to: {
        email: string;
        name?: string | undefined;
    }[];
    attachments?: {
        filename: string;
        mimeType: string;
        sizeBytes: number;
        contentBase64: string;
    }[] | undefined;
    subject?: string | undefined;
    cc?: {
        email: string;
        name?: string | undefined;
    }[] | undefined;
    bcc?: {
        email: string;
        name?: string | undefined;
    }[] | undefined;
    html?: string | undefined;
    inReplyTo?: string | undefined;
    references?: string[] | undefined;
}, {
    accountId: string;
    body: string;
    to: {
        email: string;
        name?: string | undefined;
    }[];
    attachments?: {
        filename: string;
        mimeType: string;
        sizeBytes: number;
        contentBase64: string;
    }[] | undefined;
    subject?: string | undefined;
    cc?: {
        email: string;
        name?: string | undefined;
    }[] | undefined;
    bcc?: {
        email: string;
        name?: string | undefined;
    }[] | undefined;
    html?: string | undefined;
    inReplyTo?: string | undefined;
    references?: string[] | undefined;
}>;
export declare const MailReplySchema: z.ZodObject<{
    messageId: z.ZodString;
    replyAll: z.ZodOptional<z.ZodBoolean>;
    body: z.ZodString;
    html: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    body: string;
    messageId: string;
    html?: string | undefined;
    replyAll?: boolean | undefined;
}, {
    body: string;
    messageId: string;
    html?: string | undefined;
    replyAll?: boolean | undefined;
}>;
export declare const MailForwardSchema: z.ZodObject<{
    messageId: z.ZodString;
    to: z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        name?: string | undefined;
    }, {
        email: string;
        name?: string | undefined;
    }>, "many">;
    body: z.ZodString;
    html: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    body: string;
    messageId: string;
    to: {
        email: string;
        name?: string | undefined;
    }[];
    html?: string | undefined;
}, {
    body: string;
    messageId: string;
    to: {
        email: string;
        name?: string | undefined;
    }[];
    html?: string | undefined;
}>;
export declare const MailSetFlagSchema: z.ZodObject<{
    messageId: z.ZodString;
    flag: z.ZodEnum<["read", "unread", "flagged", "unflagged"]>;
}, "strip", z.ZodTypeAny, {
    messageId: string;
    flag: "read" | "unread" | "flagged" | "unflagged";
}, {
    messageId: string;
    flag: "read" | "unread" | "flagged" | "unflagged";
}>;
export declare const MailSnoozeSchema: z.ZodObject<{
    messageId: z.ZodString;
    wakeAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    messageId: string;
    wakeAt: number;
}, {
    messageId: string;
    wakeAt: number;
}>;
export declare const MailMoveSchema: z.ZodObject<{
    messageId: z.ZodString;
    toFolderId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    messageId: string;
    toFolderId: string;
}, {
    messageId: string;
    toFolderId: string;
}>;
export declare const MailArchiveSchema: z.ZodObject<{
    messageId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    messageId: string;
}, {
    messageId: string;
}>;
export declare const MailTrashSchema: z.ZodObject<{
    messageId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    messageId: string;
}, {
    messageId: string;
}>;
export declare const MailMarkReadSchema: z.ZodObject<{
    messageId: z.ZodString;
    read: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    read: boolean;
    messageId: string;
}, {
    read: boolean;
    messageId: string;
}>;
export declare const MailMarkSpamSchema: z.ZodObject<{
    messageId: z.ZodString;
    isSpam: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    messageId: string;
    isSpam: boolean;
}, {
    messageId: string;
    isSpam: boolean;
}>;
export declare const MailSearchSchema: z.ZodObject<{
    query: z.ZodString;
    accountId: z.ZodOptional<z.ZodString>;
    folderId: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    query: string;
    accountId?: string | undefined;
    folderId?: string | undefined;
    limit?: number | undefined;
}, {
    query: string;
    accountId?: string | undefined;
    folderId?: string | undefined;
    limit?: number | undefined;
}>;
export declare const CalCreateSchema: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
export declare const CalUpdateSchema: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
export declare const CalDeleteSchema: z.ZodObject<{
    accountId: z.ZodString;
    calendarId: z.ZodString;
    eventId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    calendarId: string;
    accountId: string;
    eventId: string;
}, {
    calendarId: string;
    accountId: string;
    eventId: string;
}>;
export declare const CalImportIcsSchema: z.ZodObject<{
    accountId: z.ZodString;
    calendarId: z.ZodString;
    icsContent: z.ZodString;
}, "strip", z.ZodTypeAny, {
    calendarId: string;
    accountId: string;
    icsContent: string;
}, {
    calendarId: string;
    accountId: string;
    icsContent: string;
}>;
export declare const TasksCreateSchema: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
export declare const TasksUpdateSchema: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
export declare const TasksDeleteSchema: z.ZodObject<{
    accountId: z.ZodString;
    listId: z.ZodString;
    taskId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    accountId: string;
    listId: string;
    taskId: string;
}, {
    accountId: string;
    listId: string;
    taskId: string;
}>;
export declare const AiTestSchema: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
export declare const AiSummarizeSchema: z.ZodObject<{
    messageIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    messageIds: string[];
}, {
    messageIds: string[];
}>;
export declare const AiDraftReplySchema: z.ZodObject<{
    messageId: z.ZodString;
    tone: z.ZodOptional<z.ZodEnum<["concise", "friendly", "formal"]>>;
    bullets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    messageId: string;
    tone?: "concise" | "friendly" | "formal" | undefined;
    bullets?: string[] | undefined;
}, {
    messageId: string;
    tone?: "concise" | "friendly" | "formal" | undefined;
    bullets?: string[] | undefined;
}>;
export declare const AiNlSearchSchema: z.ZodObject<{
    query: z.ZodString;
}, "strip", z.ZodTypeAny, {
    query: string;
}, {
    query: string;
}>;
export declare const AiSetCloudKeySchema: z.ZodObject<{
    key: z.ZodString;
}, "strip", z.ZodTypeAny, {
    key: string;
}, {
    key: string;
}>;
export declare const AiPullModelSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const AiDeleteModelSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const FocusStartSchema: z.ZodObject<{
    durationMin: z.ZodNumber;
    allowMailFrom: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    durationMin: number;
    allowMailFrom?: string[] | undefined;
}, {
    durationMin: number;
    allowMailFrom?: string[] | undefined;
}>;
export declare const SchedulerCancelSchema: z.ZodObject<{
    jobId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    jobId: string;
}, {
    jobId: string;
}>;
export declare const UnsubPerformSchema: z.ZodObject<{
    email: z.ZodString;
    http: z.ZodOptional<z.ZodString>;
    mailto: z.ZodOptional<z.ZodString>;
    oneClick: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    email: string;
    oneClick: boolean;
    http?: string | undefined;
    mailto?: string | undefined;
}, {
    email: string;
    oneClick: boolean;
    http?: string | undefined;
    mailto?: string | undefined;
}>;
export declare const UnsubMuteSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const UnsubUnmuteSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const UnsubDismissSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
//# sourceMappingURL=schemas.d.ts.map