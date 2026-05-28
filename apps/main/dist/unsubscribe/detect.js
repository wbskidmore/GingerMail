export function detectUnsubscribeSuggestions(db, opts = {}) {
    const windowDays = opts.windowDays ?? 60;
    const minTotal = opts.minTotal ?? 4;
    const ratio = opts.trashRatio ?? 0.6;
    const sinceMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const rows = db.countTrashedBySender({ sinceMs, minTotal });
    const out = [];
    for (const r of rows) {
        if (r.total === 0)
            continue;
        const r_ratio = r.trashed / r.total;
        if (r_ratio < ratio)
            continue;
        // Only surface senders we can actually act on. Heuristic-only senders
        // with no List-Unsubscribe + no AI confidence are surfaced just for
        // mute (we'll hide the Unsubscribe button in that case).
        out.push({
            email: r.email,
            trashedCount: r.trashed,
            totalSeen: r.total,
            exampleMessageId: r.exampleMessageId,
            methods: {
                http: r.listUnsubscribeHttp,
                mailto: r.listUnsubscribeMailto,
                oneClick: r.listUnsubscribePost,
            },
        });
    }
    return out;
}
//# sourceMappingURL=detect.js.map