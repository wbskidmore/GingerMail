import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Empty({ icon, title, description, action }) {
    return (_jsxs("div", { className: "gm-empty", children: [icon ? _jsx("div", { className: "gm-empty__icon", children: icon }) : null, _jsx("div", { className: "gm-empty__title", children: title }), description ? _jsx("div", { className: "gm-empty__description", children: description }) : null, action ? _jsx("div", { className: "gm-empty__action", children: action }) : null] }));
}
//# sourceMappingURL=Empty.js.map