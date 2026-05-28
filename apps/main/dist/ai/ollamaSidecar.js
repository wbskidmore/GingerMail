import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { app, log } from '../electronShim.js';
export { CURATED_MODELS } from './curatedModels.js';
export const SIDECAR_HOST = '127.0.0.1';
export const SIDECAR_PORT = 11434;
/**
 * Lifecycle for the bundled Ollama process. The sidecar:
 *   - prefers an existing instance already listening on :11434 (so users
 *     who run Ollama themselves don't get a duplicate process)
 *   - otherwise spawns the bundled binary from `<resourcesPath>/ollama`
 *   - pipes stdout/stderr through electron-log
 *   - cleans up on app quit
 *
 * The renderer talks to it via `OllamaClient` at http://127.0.0.1:11434/api.
 */
export class OllamaSidecar {
    child = null;
    reusingExternal = false;
    startedAt = 0;
    lastError;
    status() {
        return {
            running: this.reusingExternal || (this.child?.pid !== undefined && !this.child.killed),
            reusingExternal: this.reusingExternal,
            uptimeMs: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
            lastError: this.lastError,
        };
    }
    /**
     * Idempotent start. If an Ollama is already running on the expected port,
     * we reuse it. Otherwise we look up the bundled binary and spawn it.
     * Returns once `/api/tags` responds 200 or after the timeout (default 30s).
     */
    async start(opts = {}) {
        if (this.reusingExternal || (this.child && !this.child.killed))
            return;
        if (await this.isPortOpen()) {
            this.reusingExternal = true;
            this.startedAt = Date.now();
            log.info('[ollama-sidecar] reusing existing instance on :11434');
            return;
        }
        const binary = this.resolveBinary();
        if (!binary) {
            this.lastError = 'Ollama binary not found in app resources. Run `pnpm fetch:ollama`.';
            log.warn(`[ollama-sidecar] ${this.lastError}`);
            return;
        }
        log.info(`[ollama-sidecar] spawning ${binary}`);
        this.child = spawn(binary, ['serve'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                OLLAMA_HOST: `${SIDECAR_HOST}:${SIDECAR_PORT}`,
                // Keep models under the user's app data dir rather than the system
                // default so the install footprint stays predictable per-user.
                OLLAMA_MODELS: path.join(app.getPath('userData'), 'ollama-models'),
            },
            detached: false,
            windowsHide: true,
        });
        this.startedAt = Date.now();
        this.child.stdout?.on('data', (b) => log.info('[ollama]', b.toString().trim()));
        this.child.stderr?.on('data', (b) => {
            const msg = b.toString().trim();
            // Ollama writes ordinary startup logs to stderr; only treat actual
            // panics as warnings to keep the log noise level reasonable.
            if (/panic|error|fatal/i.test(msg))
                log.warn('[ollama]', msg);
            else
                log.info('[ollama]', msg);
        });
        this.child.on('exit', (code, signal) => {
            log.warn(`[ollama-sidecar] exit code=${code} signal=${signal}`);
            this.child = null;
        });
        await this.waitForReady(opts.timeoutMs ?? 30_000);
    }
    async stop() {
        if (this.reusingExternal) {
            // We didn't start it; don't kill it.
            this.reusingExternal = false;
            return;
        }
        if (!this.child)
            return;
        const child = this.child;
        this.child = null;
        log.info('[ollama-sidecar] stopping');
        return new Promise((resolve) => {
            const killTimer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                }
                catch { /* already dead */ }
                resolve();
            }, 4000);
            child.once('exit', () => {
                clearTimeout(killTimer);
                resolve();
            });
            try {
                child.kill('SIGTERM');
            }
            catch { /* already dead */ }
        });
    }
    /**
     * Poll `/api/tags` until it responds 200 or until the timeout expires.
     * Returns true on success; false on timeout. Throws only on programmer
     * errors so callers can race this against quit without a try/catch.
     */
    async waitForReady(timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const res = await fetch(`http://${SIDECAR_HOST}:${SIDECAR_PORT}/api/tags`);
                if (res.ok)
                    return true;
            }
            catch {
                // server isn't up yet; back off.
            }
            await new Promise((r) => setTimeout(r, 350));
        }
        this.lastError = `Ollama did not become ready within ${Math.round(timeoutMs / 1000)}s`;
        log.warn(`[ollama-sidecar] ${this.lastError}`);
        return false;
    }
    isPortOpen() {
        return new Promise((resolve) => {
            const sock = net.createConnection({ host: SIDECAR_HOST, port: SIDECAR_PORT, timeout: 600 });
            sock.once('connect', () => {
                sock.destroy();
                resolve(true);
            });
            sock.once('error', () => resolve(false));
            sock.once('timeout', () => {
                sock.destroy();
                resolve(false);
            });
        });
    }
    /**
     * Find the bundled binary path. In dev we look under
     * `apps/main/resources/ollama/<platform>-<arch>/`, in production under
     * `<resourcesPath>/ollama/`.
     */
    resolveBinary() {
        const exe = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
        const candidates = [];
        if (app.isPackaged) {
            candidates.push(path.join(process.resourcesPath, 'ollama', exe));
        }
        else {
            const key = `${process.platform}-${process.arch}`;
            candidates.push(path.join(process.cwd(), 'apps', 'main', 'resources', 'ollama', key, exe));
        }
        for (const c of candidates) {
            if (existsSync(c))
                return c;
        }
        return null;
    }
}
//# sourceMappingURL=ollamaSidecar.js.map