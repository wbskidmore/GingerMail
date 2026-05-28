/**
 * Best-effort PII redactor for the cloud-AI request body. Tuned for the
 * "summarize this email thread" path, where the model legitimately needs
 * the conversation but does not need a real card number, SSN, OTP, or
 * direct phone line.
 *
 * Behavior is intentionally conservative: false positives are mildly
 * annoying (a date that looks like a phone number gets a placeholder);
 * false negatives are a privacy incident, so we prefer to over-redact at
 * the obvious boundaries.
 *
 * The redactor preserves the SHAPE of the data so the model can still
 * reason about it ("the customer mentioned a credit card and said it
 * was declined"), just without leaking the real digits.
 */
export interface PiiRedactStats {
    cards: number;
    ssns: number;
    phones: number;
    otps: number;
    emails: number;
    iban: number;
}
export declare function redactPii(text: string, opts?: {
    keepEmails?: boolean;
}): {
    text: string;
    stats: PiiRedactStats;
};
//# sourceMappingURL=piiRedact.d.ts.map