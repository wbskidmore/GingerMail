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
  id: string; // Ollama tag, e.g. 'llama3.2:1b'
  displayName: string;
  sizeGB: number;
  ramGB: number;
  description: string;
  /** Marks a recommended default for typical 16GB laptops. */
  recommended?: boolean;
  /** Marks a model that fits comfortably on 8GB and is the safest first pick. */
  starter?: boolean;
}

export const CURATED_MODELS: CuratedModel[] = [
  {
    id: 'qwen2.5:0.5b',
    displayName: 'Qwen 2.5 0.5B',
    sizeGB: 0.4,
    ramGB: 1.2,
    description: 'Tiny. Good for basic search and unsubscribe classification on any laptop.',
    starter: true,
  },
  {
    id: 'llama3.2:1b',
    displayName: 'Llama 3.2 1B',
    sizeGB: 1.3,
    ramGB: 2.5,
    description: 'Balanced default. Fast summaries and reply drafts on most hardware.',
    recommended: true,
  },
  {
    id: 'llama3.2:3b',
    displayName: 'Llama 3.2 3B',
    sizeGB: 2.0,
    ramGB: 4.5,
    description: 'Noticeably stronger writing quality. Recommended if you have 16GB+ RAM.',
  },
  {
    id: 'phi3.5:3.8b',
    displayName: 'Phi-3.5 Mini 3.8B',
    sizeGB: 2.2,
    ramGB: 5.0,
    description: "Microsoft's instruction-tuned model. Excellent at structured outputs.",
  },
  {
    id: 'qwen2.5:7b',
    displayName: 'Qwen 2.5 7B',
    sizeGB: 4.4,
    ramGB: 9.0,
    description: 'Top quality. Needs 16GB+ RAM and a fast SSD.',
  },
];
