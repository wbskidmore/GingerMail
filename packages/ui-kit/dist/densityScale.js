/**
 * Maps the user's density preference to concrete Mantine spacing/padding values.
 * Keeps Q11 ("density tokens applied inconsistently") solved at one place.
 */
export const densityScale = {
    compact: { rowPx: 6, pagePad: 'xs', itemSpacing: 'xs' },
    cozy: { rowPx: 10, pagePad: 'sm', itemSpacing: 'sm' },
    spacious: { rowPx: 14, pagePad: 'lg', itemSpacing: 'md' },
};
//# sourceMappingURL=densityScale.js.map