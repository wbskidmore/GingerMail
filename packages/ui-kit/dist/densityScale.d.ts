import type { DensityMode } from '@gingermail/core';
/**
 * Maps the user's density preference to concrete Mantine spacing/padding values.
 * Keeps Q11 ("density tokens applied inconsistently") solved at one place.
 */
export declare const densityScale: Record<DensityMode, {
    rowPx: number;
    pagePad: 'xs' | 'sm' | 'md' | 'lg';
    itemSpacing: 'xs' | 'sm' | 'md';
}>;
//# sourceMappingURL=densityScale.d.ts.map