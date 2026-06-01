import type { NotificationConstructorOptions } from 'electron';
import type { Logger } from 'electron-log';
import { Notification } from './electronShim.js';
import type { ScheduledJob } from '@gingermail/core';
import type { GingerMailDb } from '@gingermail/storage';
import { randomUUID } from 'node:crypto';

export interface SchedulerOptions {
  db: GingerMailDb;
  log: Pick<Logger, 'info' | 'warn' | 'error'>;
  onFire?: (job: ScheduledJob) => void;
  tickIntervalMs?: number;
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private suppressed = false;

  constructor(private readonly opts: SchedulerOptions) {}

  start(): void {
    const interval = this.opts.tickIntervalMs ?? 15_000;
    this.timer = setInterval(() => void this.tick(), interval);
    this.opts.log.info(`[scheduler] started, tick=${interval}ms`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
  }

  schedule(job: Omit<ScheduledJob, 'id' | 'createdAt'>): ScheduledJob {
    const full: ScheduledJob = { ...job, id: randomUUID(), createdAt: Date.now() };
    this.opts.db.insertJob(full);
    return full;
  }

  cancel(id: string): void {
    this.opts.db.deleteJob(id);
  }

  listAll(): ScheduledJob[] {
    return this.opts.db.listAllJobs();
  }

  async tick(): Promise<void> {
    const now = Date.now();
    const due = this.opts.db.listDueJobs(now);
    for (const job of due) {
      this.opts.db.markJobFired(job.id, now);
      if (this.suppressed) {
        this.opts.log.info(`[scheduler] suppressed job ${job.id} (focus mode)`);
        continue;
      }
      try {
        this.fire(job);
        this.opts.onFire?.(job);
      } catch (err) {
        this.opts.log.error('[scheduler] notify failed', err);
      }
    }
  }

  private fire(job: ScheduledJob): void {
    if (!Notification.isSupported()) return;
    const { title, body, urgency } = describeJob(job);
    const opts: NotificationConstructorOptions = {
      title,
      body,
      silent: false,
      urgency: urgency as NotificationConstructorOptions['urgency'],
      actions: [
        { type: 'button', text: 'Open' },
        { type: 'button', text: 'Snooze 10m' },
        { type: 'button', text: 'Done' },
      ],
    };
    const n = new Notification(opts);
    n.on('action', (_evt, idx) => {
      const action = ['open', 'snooze-10', 'done'][idx] ?? 'open';
      this.opts.onFire?.({ ...job, payload: { ...job.payload, _action: action } });
    });
    n.on('click', () => this.opts.onFire?.({ ...job, payload: { ...job.payload, _action: 'open' } }));
    n.show();
  }
}

function describeJob(job: ScheduledJob): { title: string; body: string; urgency: string } {
  const payload = job.payload as Record<string, string>;
  switch (job.kind) {
    case 'event-reminder':
      return {
        title: payload['title'] ?? 'Upcoming event',
        body: payload['when'] ?? 'You have an event coming up',
        urgency: 'normal',
      };
    case 'task-due':
      return {
        title: payload['title'] ?? 'Task due',
        body: payload['notes'] ?? 'A task is due',
        urgency: 'normal',
      };
    case 'snooze-wake':
      return { title: 'Snoozed item', body: payload['subject'] ?? 'Time to revisit', urgency: 'low' };
    case 'focus-break':
      return { title: 'Time for a break', body: 'Stand up, drink some water, look away from the screen.', urgency: 'low' };
    case 'ai-digest':
      return { title: 'GingerMail digest', body: payload['summary'] ?? 'A short summary is ready', urgency: 'low' };
    case 'reminder':
      return { title: payload['title'] ?? 'Reminder', body: payload['notes'] ?? payload['when'] ?? 'You asked to be reminded', urgency: 'normal' };
    default:
      return { title: 'GingerMail', body: 'A reminder fired', urgency: 'low' };
  }
}
