import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
/**
 * Centered, low-stimulation empty state. The same pattern in every tab gives
 * the app a predictable "nothing here yet" experience.
 */
export function EmptyState({ icon, title, description, action }) {
    return (_jsx(Center, { h: "100%", p: "xl", children: _jsxs(Stack, { align: "center", gap: "sm", maw: 420, children: [_jsx(ThemeIcon, { size: 56, radius: "xl", variant: "light", color: "gray", children: icon }), _jsx(Title, { order: 4, ta: "center", children: title }), description && (_jsx(Text, { c: "dimmed", ta: "center", size: "sm", children: description })), action] }) }));
}
//# sourceMappingURL=EmptyState.js.map