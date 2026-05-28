import type { MessagePart } from '@gingermail/core';
export interface ParsedMessage {
    html?: string;
    text?: string;
    attachments: MessagePart[];
    inReplyTo?: string;
    references?: string[];
    headers: Record<string, string>;
}
/**
 * Minimal RFC 822 parser. For production we should switch to `mailparser`,
 * but to keep dependencies small we ship a streamlined parser that extracts
 * the parts the renderer actually uses.
 */
export declare function parseRfc822(source: Buffer): Promise<ParsedMessage>;
//# sourceMappingURL=parser.d.ts.map