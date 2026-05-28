import type { ReactNode } from 'react';
export interface SnoozeMenuProps {
    /** The trigger element that opens the menu (e.g. an ActionIcon). */
    target: ReactNode;
    onSelect: (presetId: string, fireAt: number) => void;
    onCustom?: () => void;
    /** Optional label shown above the preset list. */
    title?: string;
}
/**
 * Mantine `Menu` wrapped around our snooze presets.
 *
 * Every option is rendered as a `Menu.Item` so the WAI-ARIA `menu` role
 * is intact end-to-end:
 *   - up/down arrow keys move focus between items
 *   - enter activates the focused item
 *   - escape dismisses without selecting
 *   - screen readers announce "menu item" on focus and "menu" on open
 *
 * The previous version used `UnstyledButton` rows nested inside `Stack`,
 * which broke Mantine's roving-tabindex implementation — the items were
 * reachable only with mouse / tab, not arrow keys. That's the WCAG 2.1
 * keyboard-trap regression the accessibility review flagged.
 */
export declare function SnoozeMenu({ target, onSelect, onCustom, title }: SnoozeMenuProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=SnoozeMenu.d.ts.map