import type { AppContext } from '../context.js';
export interface CalendarSyncResult {
    ok: boolean;
    errors: Array<{
        accountId: string;
        error: string;
    }>;
}
export declare function syncAllCalendars(ctx: AppContext, from: number, to: number): Promise<CalendarSyncResult>;
//# sourceMappingURL=calendarSync.d.ts.map