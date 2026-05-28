import { log } from '../electronShim.js';
import type { AppContext } from '../context.js';

export interface CalendarSyncResult {
  ok: boolean;
  errors: Array<{ accountId: string; error: string }>;
}

export async function syncAllCalendars(
  ctx: AppContext,
  from: number,
  to: number,
): Promise<CalendarSyncResult> {
  const accounts = ctx.db.listAccounts().filter((a) => a.enabled);
  const errors: Array<{ accountId: string; error: string }> = [];
  for (const account of accounts) {
    const provider = await ctx.getCalendarProvider(account.id);
    if (!provider) continue;
    try {
      const cals = await provider.listCalendars();
      ctx.db.upsertCalendars(cals);
      const events = await provider.listEvents({ from, to });
      ctx.db.upsertEvents(events);
    } catch (err) {
      // We used to silently swallow these, which meant a stale OAuth token
      // or revoked permission could keep the calendar tab empty forever
      // with no clue why. Log to electron-log + collect for the IPC return
      // so the UI can surface "Calendar sync failed for X — sign in again".
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`[calendar-sync] account=${account.id} failed:`, err);
      errors.push({ accountId: account.id, error: msg });
    }
  }
  return { ok: errors.length === 0, errors };
}
