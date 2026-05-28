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

const RULES = [
  // 13-19 digit numbers with optional separators → likely a credit card.
  // Luhn check is intentionally NOT applied; the goal is "looks card-shaped".
  { name: 'cards', re: /\b(?:\d[ -]?){13,19}\b/g, replace: '[REDACTED_CARD]' },
  // US SSN
  { name: 'ssns', re: /\b\d{3}-\d{2}-\d{4}\b/g, replace: '[REDACTED_SSN]' },
  // International phone: + then 8-15 digits, OR US 10-digit shapes
  { name: 'phones', re: /\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}/g, replace: '[REDACTED_PHONE]' },
  { name: 'phones', re: /\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, replace: '[REDACTED_PHONE]' },
  // 6-8 digit OTP that's standalone (avoids matching year+month dates)
  { name: 'otps', re: /\b\d{6,8}\b(?=\s*(?:is your|code|verification|OTP|one-?time))/gi, replace: '[REDACTED_OTP]' },
  { name: 'otps', re: /(?<=(?:OTP|code|verification)[^\d]{0,20})\b\d{6,8}\b/gi, replace: '[REDACTED_OTP]' },
  // IBAN
  { name: 'iban', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, replace: '[REDACTED_IBAN]' },
];

const EMAIL_RE = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;

export function redactPii(text: string, opts: { keepEmails?: boolean } = {}): { text: string; stats: PiiRedactStats } {
  const stats: PiiRedactStats = { cards: 0, ssns: 0, phones: 0, otps: 0, emails: 0, iban: 0 };
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, (match) => {
      const slot = stats as unknown as Record<string, number>;
      slot[rule.name] = (slot[rule.name] ?? 0) + 1;
      void match;
      return rule.replace;
    });
  }
  if (!opts.keepEmails) {
    out = out.replace(EMAIL_RE, () => {
      stats.emails += 1;
      return '[REDACTED_EMAIL]';
    });
  }
  return { text: out, stats };
}
