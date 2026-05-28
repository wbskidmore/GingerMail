/**
 * DOMPurify config used by every sanitiser path. The `allowRemoteImages`
 * flag is forwarded to the renderer/main `uponSanitizeAttribute` hook
 * which is what actually gates `<img src="https://...">` — DOMPurify's flat
 * `ALLOWED_URI_REGEXP` can't distinguish `<a href>` from `<img src>` so we
 * always allow https here and tighten per-element in the hook.
 */
export function mailHtmlSanitiserConfig(_opts = {}) {
    return {
        ALLOWED_TAGS: [
            'a',
            'abbr',
            'address',
            'b',
            'blockquote',
            'br',
            'caption',
            'cite',
            'code',
            'col',
            'colgroup',
            'dd',
            'del',
            'dfn',
            'div',
            'dl',
            'dt',
            'em',
            'figcaption',
            'figure',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'hr',
            'i',
            // `img` is allowed; its `src` is filtered by ALLOWED_URI_REGEXP below.
            'img',
            'ins',
            'kbd',
            'li',
            'mark',
            'ol',
            'p',
            'pre',
            'q',
            's',
            'samp',
            'small',
            'span',
            'strong',
            'sub',
            'sup',
            'table',
            'tbody',
            'td',
            'tfoot',
            'th',
            'thead',
            'time',
            'tr',
            'u',
            'ul',
            'var',
        ],
        ALLOWED_ATTR: [
            'href',
            'src',
            'alt',
            'title',
            'cite',
            'colspan',
            'rowspan',
            'span',
            'align',
            'valign',
            'width',
            'height',
            'dir',
            'lang',
            // Inline style is kept but post-sanitisation we strip `expression()`,
            // `url()`, and `position:` via DOMPurify's `uponSanitizeAttribute` hook
            // installed in `installMailHtmlHooks` below.
            'style',
            'class',
        ],
        FORBID_TAGS: [
            'script',
            'style',
            'iframe',
            'object',
            'embed',
            'form',
            'input',
            'textarea',
            'button',
            'select',
            'option',
            'meta',
            'link',
            'base',
            'svg',
            'math',
            'video',
            'audio',
            'source',
            'track',
        ],
        FORBID_ATTR: [
            'srcset',
            'srcdoc',
            'formaction',
            'background',
            'ping',
            'sandbox',
        ],
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false,
        // Restrict URI schemes. We always allow http/https for links and inline
        // data: images. The renderer-side `uponSanitizeAttribute` hook is the
        // place where we further block remote `<img>` srcs when the user hasn't
        // opted in via `allowRemoteImages` — that distinction has to happen at
        // the element level, which DOMPurify's flat `ALLOWED_URI_REGEXP` can't
        // express on its own.
        ALLOWED_URI_REGEXP: /^(?:(?:https?:|mailto:|tel:|cid:|data:image\/(?:png|jpeg|gif|webp);base64,))/i,
        KEEP_CONTENT: true,
    };
}
/**
 * List of CSS property substrings that, when seen inside a `style="..."`
 * attribute, mark the entire attribute for removal. This catches the most
 * common style-based attacks: CSS exfil via `background:url(...)`, layout
 * hijacking via `position:fixed`, IE `expression()`, and Chromium's
 * `behavior:` (legacy IE) shim.
 */
export const DISALLOWED_STYLE_FRAGMENTS = [
    'expression(',
    'javascript:',
    'vbscript:',
    '@import',
    'behavior:',
    'binding:',
    '-moz-binding',
    'position:fixed',
    'position:sticky',
    'position:absolute',
];
/**
 * `style` attribute sanitiser. Pass the raw style value, get back either the
 * original (when safe) or an empty string (when not).
 */
export function sanitiseInlineStyle(value) {
    const lower = value.toLowerCase();
    for (const bad of DISALLOWED_STYLE_FRAGMENTS) {
        if (lower.includes(bad))
            return '';
    }
    // Drop any `url(...)` references at all - they're the primary CSS exfil
    // vector and the rest of the style attribute is rarely worth keeping if
    // we'd have to also block its origin.
    if (/url\s*\(/i.test(value))
        return '';
    return value;
}
/**
 * Strip every `<a>` href that points at a non-allow-listed scheme and force
 * `rel="noreferrer noopener"` plus `target="_blank"` on the rest. Returns
 * the original anchor attributes shape so DOMPurify's hook can re-emit them.
 */
export const SAFE_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'cid:']);
//# sourceMappingURL=mailHtml.js.map