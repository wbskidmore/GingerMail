export function summarizeThreadPrompt(): string {
  return [
    'You are an email assistant for a user with ADHD.',
    'Summarise the email thread in 3-5 short bullet points.',
    'Identify clear action items the user needs to take.',
    'Reply ONLY with a JSON object of shape {"summary": string, "actionItems": string[]}.',
    'Keep the tone direct and calm. Do not add filler or apologies.',
  ].join(' ');
}

export function draftReplyPrompt(tone?: string, intent?: string): string {
  const toneText = tone ? `Use a ${tone} tone.` : 'Use a warm but concise tone.';
  const intentText = intent ? `The user wants to: ${intent}.` : '';
  return [
    'You are drafting an email reply for the user.',
    toneText,
    intentText,
    'Match the language and formality of the most recent message.',
    'Do not invent facts. If you need more information, leave a clearly marked [BRACKET] for the user to fill in.',
    'Reply with only the email body, no headers, no greeting commentary.',
  ].join(' ');
}

export function extractActionItemsPrompt(): string {
  return [
    'Extract concrete, actionable tasks from the email below.',
    'A task should be something the recipient must do, not something they merely need to know.',
    'For each task, infer a due date if one is explicit in the text; otherwise omit it.',
    'Reply with a JSON object of shape {"items": [{"title": string, "due": ISO8601 string optional, "notes": string optional}]}.',
  ].join(' ');
}

export function nlSearchPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    'You convert a natural-language email search query into a JSON spec the app can run against a SQLite FTS5 index.',
    'The FTS index has these searchable columns: subject, snippet, from_text, body_text.',
    `Today is ${today}. Resolve relative dates ("last week", "yesterday") against that.`,
    'Reply with ONLY a JSON object of this shape:',
    '{"ftsQuery": string, "after": ISO8601 date optional, "before": ISO8601 date optional, "unread": boolean optional, "explanation": string}',
    'Rules for ftsQuery:',
    '- Wrap each user term in double quotes ("foo bar").',
    '- When the user names a sender, scope the term: from_text:"alice".',
    '- When they mention "subject", scope: subject:"budget".',
    '- Combine multiple terms with AND. Use OR only when the user clearly wants either/or.',
    '- Never include SQL, only FTS5 MATCH syntax.',
    '- If the user supplies no meaningful keywords, set ftsQuery to "".',
    'The explanation is one short sentence (< 12 words) describing how you interpreted the query, addressed to the user.',
  ].join(' ');
}

export function classifySendersForUnsubscribePrompt(): string {
  return [
    'You are evaluating email senders that the user routinely deletes without reading.',
    'For each sender, decide if it is almost certainly a bulk newsletter / promotional list ("unsubscribe"),',
    'a transactional or one-to-one sender that should NOT be unsubscribed from ("keep"),',
    'or a noisy automated sender that does not offer unsubscribe but the user might want to mute locally ("mute").',
    'Bias hard towards "keep" when there is any signal of personal correspondence or transactional value (receipts, account alerts).',
    'Reply ONLY with a JSON object of shape {"items":[{"email": string, "verdict": "unsubscribe"|"mute"|"keep", "confidence": 0..1, "reason": string}]}.',
    'Confidence must be at least 0.75 for any verdict other than "keep".',
  ].join(' ');
}

export function prioritizeInboxPrompt(): string {
  return [
    'Classify each email by the user energy level it likely needs.',
    '"high" - real focus and decision-making required.',
    '"medium" - meaningful but routine (replies, status updates).',
    '"low" - low-effort skim or auto-archivable (newsletters, automated alerts).',
    'Reply with a JSON object of shape {"items":[{"id": string, "energy": "high"|"medium"|"low"}]}.',
  ].join(' ');
}
