import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Menu, Text, Group } from '@mantine/core';
import { IconClock, IconCalendarTime } from '@tabler/icons-react';
import { SNOOZE_PRESETS } from '@gingermail/core';
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
export function SnoozeMenu({ target, onSelect, onCustom, title = 'Snooze until' }) {
    const now = new Date();
    return (_jsxs(Menu, { width: 300, withArrow: true, shadow: "md", trapFocus: true, closeOnEscape: true, children: [_jsx(Menu.Target, { children: target }), _jsxs(Menu.Dropdown, { "aria-label": title, children: [_jsx(Menu.Label, { children: _jsxs(Group, { gap: 6, children: [_jsx(IconClock, { size: 14, "aria-hidden": true }), _jsx("span", { children: title })] }) }), SNOOZE_PRESETS.map((p) => {
                        const at = p.compute(now);
                        const stamp = at.toLocaleString(undefined, {
                            weekday: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                        });
                        return (_jsx(Menu.Item, { onClick: () => onSelect(p.id, at.getTime()), "aria-label": `${p.label} (${stamp})`, rightSection: _jsx(Text, { size: "xs", c: "dimmed", children: stamp }), children: p.label }, p.id));
                    }), onCustom && (_jsxs(_Fragment, { children: [_jsx(Menu.Divider, {}), _jsx(Menu.Item, { leftSection: _jsx(IconCalendarTime, { size: 14, "aria-hidden": true }), onClick: onCustom, children: "Pick custom time\u2026" })] }))] })] }));
}
//# sourceMappingURL=SnoozeMenu.js.map