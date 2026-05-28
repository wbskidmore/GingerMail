import fs from 'node:fs';
import path from 'node:path';
import { defaultAppSettings, type AppSettings } from '@gingermail/core';

/**
 * Tiny JSON-on-disk preference store. We replaced electron-store@10 because
 * its index.js does `import electron from 'electron'` at the top of an ESM
 * module, which crashes Electron 32's main process Node 20.18 with a
 * CJS-from-ESM interop bug (https://github.com/electron/electron/issues/40751).
 *
 * Electron-store gave us almost nothing we don't already have here:
 * atomic write, schema defaults, and per-platform userData location.
 */
export interface PrefsShape {
  settings: AppSettings;
}

export interface PrefsStore {
  get<K extends keyof PrefsShape>(key: K, fallback: PrefsShape[K]): PrefsShape[K];
  set<K extends keyof PrefsShape>(key: K, value: PrefsShape[K]): void;
  readonly path: string;
}

export interface OpenPrefsOptions {
  /** Absolute directory where the prefs file should live. Caller passes `app.getPath('userData')`. */
  dir: string;
  /** Filename (without `.json`). Defaults to `gingermail-prefs`. */
  name?: string;
}

class JsonPrefsStore implements PrefsStore {
  readonly path: string;
  private data: PrefsShape;

  constructor(dir: string, name: string, defaults: PrefsShape) {
    this.path = path.join(dir, `${name}.json`);
    this.data = { ...defaults };
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* dir exists */
    }
    try {
      const raw = fs.readFileSync(this.path, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { ...defaults, ...parsed };
    } catch {
      // file missing or unparseable: rewrite with defaults so we self-heal
      this.persist();
    }
  }

  get<K extends keyof PrefsShape>(key: K, fallback: PrefsShape[K]): PrefsShape[K] {
    return this.data[key] ?? fallback;
  }

  set<K extends keyof PrefsShape>(key: K, value: PrefsShape[K]): void {
    this.data[key] = value;
    this.persist();
  }

  private persist(): void {
    const tmp = `${this.path}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.path);
  }
}

export function openPrefs(opts: OpenPrefsOptions): PrefsStore {
  const name = opts.name ?? 'gingermail-prefs';
  return new JsonPrefsStore(opts.dir, name, { settings: defaultAppSettings });
}

export function readSettings(store: PrefsStore): AppSettings {
  return store.get('settings', defaultAppSettings);
}

export function writeSettings(store: PrefsStore, patch: Partial<AppSettings>): AppSettings {
  const current = readSettings(store);
  const next: AppSettings = {
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
