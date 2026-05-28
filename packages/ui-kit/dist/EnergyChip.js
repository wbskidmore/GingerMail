import { jsx as _jsx } from "react/jsx-runtime";
import { Badge } from '@mantine/core';
const LABELS = {
    high: 'Focus',
    medium: 'Normal',
    low: 'Skim',
};
const COLORS = {
    high: 'orange',
    medium: 'cyan',
    low: 'gray',
};
export function EnergyChip({ tag, size = 'xs' }) {
    if (!tag)
        return null;
    return (_jsx(Badge, { variant: "light", color: COLORS[tag], size: size, radius: "sm", tt: "none", children: LABELS[tag] }));
}
//# sourceMappingURL=EnergyChip.js.map