import { Notification } from './electronShim.js';
import { randomUUID } from 'node:crypto';
export class Scheduler {
    opts;
    timer = null;
    suppressed = false;
    constructor(opts) {
        this.opts = opts;
    }
    start() {
        const interval = this.opts.tickIntervalMs ?? 15_000;
        this.timer = setInterval(() => void this.tick(), interval);
        this.opts.log.info(`[scheduler] started, tick=${interval}ms`);
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
    }
    setSuppressed(suppressed) {
        this.suppressed = suppressed;
    }
    schedule(job) {
        const full = { ...job, id: randomUUID(), createdAt: Date.now() };
        this.opts.db.insertJob(full);
        return full;
    }
    cancel(id) {
        this.opts.db.deleteJob(id);
    }
    listAll() {
        return this.opts.db.listAllJobs();
    }
    async tick() {
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
            }
            catch (err) {
                this.opts.log.error('[scheduler] notify failed', err);
            }
        }
    }
    fire(job) {
        if (!Notification.isSupported())
            return;
        const { title, body, urgency } = describeJob(job);
        const opts = {
            title,
            body,
            silent: false,
            urgency: urgency,
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
function describeJob(job) {
    const payload = job.payload;
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
        default:
            return { title: 'GingerMail', body: 'A reminder fired', urgency: 'low' };
    }
}
//# sourceMappingURL=scheduler.js.map