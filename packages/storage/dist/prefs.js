import fs from 'node:fs';
import path from 'node:path';
import { defaultAppSettings } from '@gingermail/core';
class JsonPrefsStore {
    path;
    data;
    constructor(dir, name, defaults) {
        this.path = path.join(dir, `${name}.json`);
        this.data = { ...defaults };
        try {
            fs.mkdirSync(dir, { recursive: true });
        }
        catch {
            /* dir exists */
        }
        try {
            const raw = fs.readFileSync(this.path, 'utf8');
            const parsed = JSON.parse(raw);
            this.data = { ...defaults, ...parsed };
        }
        catch {
            // file missing or unparseable: rewrite with defaults so we self-heal
            this.persist();
        }
    }
    get(key, fallback) {
        return this.data[key] ?? fallback;
    }
    set(key, value) {
        this.data[key] = value;
        this.persist();
    }
    persist() {
        const tmp = `${this.path}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
        fs.renameSync(tmp, this.path);
    }
}
export function openPrefs(opts) {
    const name = opts.name ?? 'gingermail-prefs';
    return new JsonPrefsStore(opts.dir, name, { settings: defaultAppSettings });
}
export function readSettings(store) {
    return store.get('settings', defaultAppSettings);
}
export function writeSettings(store, patch) {
    const current = readSettings(store);
    const next = {
        ...current,
        ...patch,
        appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
        notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
        ai: { ...current.ai, ...(patch.ai ?? {}) },
        updates: {
            optIn: false,
            channel: 'latest',
            ...(current.updates ?? {}),
            ...(patch.updates ?? {}),
        },
        focus: { ...current.focus, ...(patch.focus ?? {}) },
    };
    store.set('settings', next);
    return next;
}
//# sourceMappingURL=prefs.js.map