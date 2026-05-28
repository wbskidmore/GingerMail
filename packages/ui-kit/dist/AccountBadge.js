import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Avatar, Group, Stack, Text } from '@mantine/core';
/** Compact account row used in the mail sidebar and account list. */
export function AccountBadge({ displayName, emailAddress, color }) {
    const initials = displayName
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || emailAddress.slice(0, 1).toUpperCase();
    return (_jsxs(Group, { gap: "sm", wrap: "nowrap", children: [_jsx(Avatar, { color: color ?? 'ginger', radius: "xl", size: "sm", children: initials }), _jsxs(Stack, { gap: 0, children: [_jsx(Text, { size: "sm", fw: 500, lineClamp: 1, children: displayName || emailAddress }), _jsx(Text, { size: "xs", c: "dimmed", lineClamp: 1, children: emailAddress })] })] }));
}
//# sourceMappingURL=AccountBadge.js.map