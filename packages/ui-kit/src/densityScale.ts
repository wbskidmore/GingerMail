import type { DensityMode } from '@gingermail/core';

/**
 * Maps the user's density preference to concrete Mantine spacing/padding values.
 * Keeps Q11 ("density tokens applied inconsistently") solved at one place.
 */
export const densityScale: Record<DensityMode, { rowPx: number; pagePad: 'xs' | 'sm' | 'md' | 'lg'; itemSpacing: 'xs' | 'sm' | 'md' }> = {
  compact: { rowPx: 6, pagePad: 'xs', itemSpacing: 'xs' },
  cozy: { rowPx: 10, pagePad: 'sm', itemSpacing: 'sm' },
  spacious: { rowPx: 14, pagePad: 'lg', itemSpacing: 'md' },
};
