import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Affix, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconFocus2 } from '@tabler/icons-react';
import { focusRemainingMs } from '@gingermail/core';
/**
 * Minimal, low-stimulation focus indicator. Anchored to the bottom-center
 * so it never obscures the active conversation/event/task.
 */
export function FocusOverlay({ state, onStop }) {
    const [, force] = useState(0);
    useEffect(() => {
        const t = setInterval(() => force((n) => n + 1), 1000);
        return () => clearInterval(t);
    }, []);
    if (!state.active)
        return null;
    const remaining = focusRemainingMs(state);
    const minutes = Math.floor(remaining / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000);
    return (_jsx(Affix, { position: { bottom: 24, left: '50%' }, style: { transform: 'translateX(-50%)' }, children: _jsx(Paper, { shadow: "md", radius: "xl", p: "md", withBorder: true, children: _jsxs(Group, { gap: "md", wrap: "nowrap", children: [_jsx(IconFocus2, { size: 22 }), _jsxs(Stack, { gap: 2, children: [_jsx(Title, { order: 6, m: 0, children: "Focus mode" }), _jsx(Text, { size: "xs", c: "dimmed", children: "Notifications paused. One thing at a time." })] }), _jsxs(Text, { fw: 600, ff: "monospace", size: "xl", c: "ginger.6", style: { fontVariantNumeric: 'tabular-nums' }, children: [String(minutes).padStart(2, '0'), ":", String(seconds).padStart(2, '0')] }), _jsx(Button, { variant: "subtle", size: "xs", onClick: onStop, children: "End" })] }) }) }));
}
//# sourceMappingURL=FocusOverlay.js.map