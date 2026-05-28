/**
 * Canonical, allow-listed DOMPurify config used by every mail-rendering path
 * (renderer iframe + main-process print). Centralised here so the renderer
 * and main agree on exactly which tags/attributes survive.
 *
 * Why this config:
 *   - Strips every active scripting surface (`<script>`, `<style>`, `on*`,
 *     `javascript:`, `data:` URLs except inline images).
 *   - Drops every remote-resource loader by default (`<img>` remote src,
 *     `<link>`, `<iframe>`, `<object>`, `<embed>`, `<form>`). Remote images
 *     are gated behind the renderer's explicit "Load images from sender"
 *     toggle; this config blocks them at parse time.
 *   - Keeps the structural/textual markup that mailers actually need so the
 *     output still looks like an email and not a wall of plain text.
 *
 * If a user explicitly chooses "Load remote images from this sender", the
 * caller should re-run sanitisation with `allowRemoteImages: true`.
 */
export interface MailHtmlOptions {
    /** When true, http(s) `<img>` tags are kept. Default: false. */
    allowRemoteImages?: boolean;
}
/**
 * DOMPurify config used by every sanitiser path. The `allowRemoteImages`
 * flag is forwarded to the renderer/main `uponSanitizeAttribute` hook
 * which is what actually gates `<img src="https://...">` — DOMPurify's flat
 * `ALLOWED_URI_REGEXP` can't distinguish `<a href>` from `<img src>` so we
 * always allow https here and tighten per-element in the hook.
 */
export declare function mailHtmlSanitiserConfig(_opts?: MailHtmlOptions): {
    ALLOWED_TAGS: string[];
    ALLOWED_ATTR: string[];
    FORBID_TAGS: string[];
    FORBID_ATTR: string[];
    ALLOW_DATA_ATTR: boolean;
    ALLOW_UNKNOWN_PROTOCOLS: boolean;
    ALLOWED_URI_REGEXP: RegExp;
    KEEP_CONTENT: boolean;
};
/**
 * List of CSS property substrings that, when seen inside a `style="..."`
 * attribute, mark the entire attribute for removal. This catches the most
 * common style-based attacks: CSS exfil via `background:url(...)`, layout
 * hijacking via `position:fixed`, IE `expression()`, and Chromium's
 * `behavior:` (legacy IE) shim.
 */
export declare const DISALLOWED_STYLE_FRAGMENTS: string[];
/**
 * `style` attribute sanitiser. Pass the raw style value, get back either the
 * original (when safe) or an empty string (when not).
 */
export declare function sanitiseInlineStyle(value: string): string;
/**
 * Strip every `<a>` href that points at a non-allow-listed scheme and force
 * `rel="noreferrer noopener"` plus `target="_blank"` on the rest. Returns
 * the original anchor attributes shape so DOMPurify's hook can re-emit them.
 */
export declare const SAFE_LINK_SCHEMES: Set<string>;
//# sourceMappingURL=mailHtml.d.ts.map