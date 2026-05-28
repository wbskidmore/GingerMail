import { jsx as _jsx } from "react/jsx-runtime";
const PATHS = {
    mail: 'M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11A2.5 2.5 0 0 1 19.5 20h-15A2.5 2.5 0 0 1 2 17.5v-11Zm2.6.5 7.4 5.2L19.4 7',
    calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 5h14M8 3v4m8-4v4',
    check: 'M4 12l5 5L20 6',
    star: 'M12 3l2.9 6 6.6.6-5 4.6 1.6 6.5L12 17.8 5.9 20.7 7.5 14.2l-5-4.6 6.6-.6L12 3z',
    'star-filled': 'M12 3l2.9 6 6.6.6-5 4.6 1.6 6.5L12 17.8 5.9 20.7 7.5 14.2l-5-4.6 6.6-.6L12 3z',
    flag: 'M5 21V4h13l-2 4 2 4H5',
    snooze: 'M12 3a9 9 0 1 0 9 9M16 8h-4l4 6h-4M19 4l3 3M22 4l-3 3',
    reply: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 5 5v6',
    forward: 'M15 10l5 5-5 5M20 15H9a5 5 0 0 1-5-5V4',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13',
    archive: 'M3 6h18v4H3zM4 10v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9M10 14h4',
    search: 'M11 19a8 8 0 1 1 5.3-14 8 8 0 0 1-5.3 14ZM21 21l-5-5',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4-2.6.4.7 2.6-2.2 1.3-1.6-2.1-2.6.7-.4 2.6h-2.5l-.4-2.6-2.6-.7-1.6 2.1-2.2-1.3.7-2.6L3 12l2.6-.4-.7-2.6L7.1 7.7l1.6 2.1 2.6-.7L11.7 6.5h2.5l.4 2.6 2.6.7 1.6-2.1 2.2 1.3-.7 2.6L21 12Z',
    sparkles: 'M12 3 13.5 8 19 9.5 13.5 11 12 16 10.5 11 5 9.5 10.5 8 12 3ZM18 17l1 3 3 1-3 1-1 3-1-3-3-1 3-1z',
    focus: 'M12 4v3M12 17v3M4 12H1M23 12h-3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M5.2 18.8l2.1-2.1M16.7 7.3l2.1-2.1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    plus: 'M12 5v14M5 12h14',
    inbox: 'M3 12h6l2 3h2l2-3h6M3 12V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
};
export function Icon({ name, size = 16, ...rest }) {
    return (_jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...rest, children: _jsx("path", { d: PATHS[name] }) }));
}
//# sourceMappingURL=Icon.js.map