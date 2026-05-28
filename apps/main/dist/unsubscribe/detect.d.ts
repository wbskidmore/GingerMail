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
export declare function detectUnsubscribeSuggestions(db: GingerMailDb, opts?: DetectOptions): UnsubscribeSuggestion[];
//# sourceMappingURL=detect.d.ts.map