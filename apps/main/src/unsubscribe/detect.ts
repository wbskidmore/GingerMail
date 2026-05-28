import type { UnsubscribeSuggestion } from '@gingermail/core';
import type { GingerMailDb } from '@gingermail/storage';

/**
 * Heuristic detection for unsubscribe candidates.
 *
 * Returns senders where the user has been trashing more than `threshold`
 * of recent messages (default 60%) and that GingerMail has seen at least
 * `minTotal` times in the lookback window. Excludes senders we've already
 * taken an action on (`sender_actions` table).
 *
 * Tuned conservatively: the goal is "almost certainly junk" rather than
 * "might be junk". False positives are extremely annoying because they
 * train the user to ignore the banner.
 */
export interface DetectOptions {
  /** How far back to look. Default: 60 days. */
  windowDays?: number;
  /** Minimum messages seen before a sender is even a candidate. Default: 4. */
  minTotal?: number;
  /** Trash ratio that makes a sender a candidate. Default: 0.6. */
  trashRatio?: number;
}

export function detectUnsubscribeSuggestions(
  db: GingerMailDb,
  opts: DetectOptions = {},
): UnsubscribeSuggestion[] {
  const windowDays = opts.windowDays ?? 60;
  const minTotal = opts.minTotal ?? 4;
  const ratio = opts.trashRatio ?? 0.6;
  const sinceMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const rows = db.countTrashedBySender({ sinceMs, minTotal });
  const out: UnsubscribeSuggestion[] = [];
  for (const r of rows) {
    if (r.total === 0) continue;
    const r_ratio = r.trashed / r.total;
    if (r_ratio < ratio) continue;
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
