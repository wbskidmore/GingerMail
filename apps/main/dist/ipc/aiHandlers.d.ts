import type { AppContext } from '../context.js';
/** Start the sidecar in the background; callers may await this on quit. */
export declare function startOllamaSidecar(): Promise<void>;
export declare function stopOllamaSidecar(): Promise<void>;
export declare function handleAi(ctx: AppContext): void;
//# sourceMappingURL=aiHandlers.d.ts.map