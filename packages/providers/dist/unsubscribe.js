export function parseListUnsubscribe(value, post) {
    const out = { oneClick: false };
    if (post && /one[-\s]?click/i.test(post)) {
        out.oneClick = true;
    }
    if (!value)
        return out;
    // Tokens are comma-separated, each `<scheme:...>` or bare URL.
    const tokens = value.split(',').map((t) => t.trim());
    for (const raw of tokens) {
        if (!raw)
            continue;
        // Strip angle brackets if present.
        const t = raw.replace(/^<|>$/g, '').trim();
        if (!t)
            continue;
        if (/^https?:\/\//i.test(t)) {
            // Reject http://; only https is safe for one-click POSTs.
            if (/^https:\/\//i.test(t) && !out.http)
                out.http = t;
            continue;
        }
        if (/^mailto:/i.test(t)) {
            if (!out.mailto)
                out.mailto = t;
            continue;
        }
    }
    return out;
}
//# sourceMappingURL=unsubscribe.js.map