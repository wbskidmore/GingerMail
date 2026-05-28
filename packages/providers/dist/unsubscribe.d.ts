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
export declare function parseListUnsubscribe(value: string | undefined, post?: string): ParsedListUnsubscribe;
//# sourceMappingURL=unsubscribe.d.ts.map