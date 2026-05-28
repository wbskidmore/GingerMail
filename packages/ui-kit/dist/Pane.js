import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
export function Pane({ title, actions, scrollable = true, variant = 'content', className, children, ...rest }) {
    return (_jsxs("section", { className: clsx('gm-pane', `gm-pane--${variant}`, className), ...rest, children: [(title || actions) && (_jsxs("header", { className: "gm-pane__header", children: [title ? _jsx("h2", { className: "gm-pane__title", children: title }) : _jsx("div", {}), actions ? _jsx("div", { className: "gm-pane__actions", children: actions }) : null] })), _jsx("div", { className: clsx('gm-pane__body', { 'gm-pane__body--scroll': scrollable }), children: children })] }));
}
//# sourceMappingURL=Pane.js.map