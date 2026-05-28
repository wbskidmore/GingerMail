import type { AppContext } from '../context.js';
export interface TaskSyncResult {
    ok: boolean;
    errors: Array<{
        accountId: string;
        error: string;
    }>;
}
export declare function syncAllTasks(ctx: AppContext): Promise<TaskSyncResult>;
//# sourceMappingURL=taskSync.d.ts.map