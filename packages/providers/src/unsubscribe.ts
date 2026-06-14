/**
 * RFC 2369 + RFC 8058 header parser. Given the raw values of
 * `List-Unsubscribe` and `List-Unsubscribe-Post`, return the canonical
 * unsubscribe targets we'll surface in the UI.
 *
 * Examples we handle:
 *   List-Unsubscribe: <mailto:unsubscribe@example.com>, <https://example.com/u/abc>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 * Hostile-friendly: tolerant of missing angle brackets, multiple commas,
 * extra whitespace, mixed-case scheme tags, and either header ordering.
 */
export interface ParsedListUnsubscribe {
  http?: string;
  mailto?: string;
  oneClick: boolean;
}

export function parseListUnsubscribe(
  value: string | undefined,
  post?: string,
): ParsedListUnsubscribe {
  const out: ParsedListUnsubscribe = { oneClick: false };
  if (post && /one[-\s]?click/i.test(post)) {
    out.oneClick = true;
  }
  if (!value) return out;
  // Tokens are comma-separated, each `<scheme:...>` or bare URL.
  const tokens = value.split(',').map((t) => t.trim());
  for (const raw of tokens) {
    if (!raw) continue;
    // Strip angle brackets if present.
    const t = raw.replace(/^<|>$/g, '').trim();
    if (!t) continue;
    if (/^https?:\/\//i.test(t)) {
      // Reject http://; only https is safe for one-click POSTs.
      if (/^https:\/\//i.test(t) && !out.http) out.http = t;
      continue;
    }
    if (/^mailto:/i.test(t)) {
      if (!out.mailto) out.mailto = t;
      continue;
    }
  }
  return out;
}
