import type { Logger } from 'electron-log';
import type { ScheduledJob } from '@gingermail/core';
import type { GingerMailDb } from '@gingermail/storage';
export interface SchedulerOptions {
    db: GingerMailDb;
    log: Pick<Logger, 'info' | 'warn' | 'error'>;
    onFire?: (job: ScheduledJob) => void;
    tickIntervalMs?: number;
}
export declare class Scheduler {
    private readonly opts;
    private timer;
    private suppressed;
    constructor(opts: SchedulerOptions);
    start(): void;
    stop(): void;
    setSuppressed(suppressed: boolean): void;
    schedule(job: Omit<ScheduledJob, 'id' | 'createdAt'>): ScheduledJob;
    cancel(id: string): void;
    listAll(): ScheduledJob[];
    tick(): Promise<void>;
    private fire;
}
//# sourceMappingURL=scheduler.d.ts.map