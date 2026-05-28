import { log } from '../electronShim.js';
import type { AppContext } from '../context.js';

export interface TaskSyncResult {
  ok: boolean;
  errors: Array<{ accountId: string; error: string }>;
}

export async function syncAllTasks(ctx: AppContext): Promise<TaskSyncResult> {
  const accounts = ctx.db.listAccounts().filter((a) => a.enabled);
  const errors: Array<{ accountId: string; error: string }> = [];
  for (const account of accounts) {
    const provider = await ctx.getTaskProvider(account.id);
    if (!provider) continue;
    try {
      const lists = await provider.listLists();
      ctx.db.upsertTaskLists(lists);
      const tasks = await provider.listTasks();
      ctx.db.upsertTasks(tasks);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`[task-sync] account=${account.id} failed:`, err);
      errors.push({ accountId: account.id, error: msg });
    }
  }
  return { ok: errors.length === 0, errors };
}
