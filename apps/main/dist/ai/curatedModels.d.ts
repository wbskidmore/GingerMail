/**
 * Curated model registry. Surfaced to the renderer's first-launch wizard
 * and the Settings panel. Sizes are the on-disk weights footprint; RAM is
 * the typical resident set size while a request is in flight.
 *
 * Keep this list short on purpose - too many options is the #1 failure
 * mode for "pick a model" UX. Add new models behind a clear use case.
 *
 * This file is intentionally Electron-free so the registry can be loaded
 * from vitest (which doesn't boot the main process).
 */
export interface CuratedModel {
    id: string;
    displayName: string;
    sizeGB: number;
    ramGB: number;
    description: string;
    /** Marks a recommended default for typical 16GB laptops. */
    recommended?: boolean;
    /** Marks a model that fits comfortably on 8GB and is the safest first pick. */
    starter?: boolean;
}
export declare const CURATED_MODELS: CuratedModel[];
//# sourceMappingURL=curatedModels.d.ts.map