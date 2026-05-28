export function createFocusState(durationMin, breakEveryMin, now = new Date()) {
    const start = now.getTime();
    const end = start + durationMin * 60_000;
    return {
        active: true,
        startedAt: start,
        endsAt: end,
        breakReminderAt: breakEveryMin ? start + breakEveryMin * 60_000 : undefined,
    };
}
export function isFocusExpired(state, now = new Date()) {
    if (!state.active || !state.endsAt)
        return false;
    return now.getTime() >= state.endsAt;
}
export function focusRemainingMs(state, now = new Date()) {
    if (!state.active || !state.endsAt)
        return 0;
    return Math.max(0, state.endsAt - now.getTime());
}
//# sourceMappingURL=focus.js.map