import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
export function Button({ className, variant = 'secondary', size = 'md', icon, children, ...rest }) {
    return (_jsxs("button", { type: "button", ...rest, className: clsx('gm-button', `gm-button--${variant}`, `gm-button--${size}`, className), children: [icon ? _jsx("span", { className: "gm-button__icon", children: icon }) : null, children] }));
}
//# sourceMappingURL=Button.js.map