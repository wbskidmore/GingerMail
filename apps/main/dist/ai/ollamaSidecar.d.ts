export { CURATED_MODELS } from './curatedModels.js';
export type { CuratedModel } from './curatedModels.js';
export declare const SIDECAR_HOST = "127.0.0.1";
export declare const SIDECAR_PORT = 11434;
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
export declare class OllamaSidecar {
    private child;
    private reusingExternal;
    private startedAt;
    private lastError;
    status(): {
        running: boolean;
        reusingExternal: boolean;
        uptimeMs: number;
        lastError?: string;
    };
    /**
     * Idempotent start. If an Ollama is already running on the expected port,
     * we reuse it. Otherwise we look up the bundled binary and spawn it.
     * Returns once `/api/tags` responds 200 or after the timeout (default 30s).
     */
    start(opts?: {
        timeoutMs?: number;
    }): Promise<void>;
    stop(): Promise<void>;
    /**
     * Poll `/api/tags` until it responds 200 or until the timeout expires.
     * Returns true on success; false on timeout. Throws only on programmer
     * errors so callers can race this against quit without a try/catch.
     */
    waitForReady(timeoutMs: number): Promise<boolean>;
    private isPortOpen;
    /**
     * Find the bundled binary path. In dev we look under
     * `apps/main/resources/ollama/<platform>-<arch>/`, in production under
     * `<resourcesPath>/ollama/`.
     */
    private resolveBinary;
}
//# sourceMappingURL=ollamaSidecar.d.ts.map