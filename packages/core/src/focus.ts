export interface FocusState {
  active: boolean;
  endsAt?: number;
  startedAt?: number;
  breakReminderAt?: number;
}

export function createFocusState(
  durationMin: number,
  breakEveryMin?: number,
  now: Date = new Date(),
): FocusState {
  const start = now.getTime();
  const end = start + durationMin * 60_000;
  return {
    active: true,
    startedAt: start,
    endsAt: end,
    breakReminderAt: breakEveryMin ? start + breakEveryMin * 60_000 : undefined,
  };
}

export function isFocusExpired(state: FocusState, now: Date = new Date()): boolean {
  if (!state.active || !state.endsAt) return false;
  return now.getTime() >= state.endsAt;
}

export function focusRemainingMs(state: FocusState, now: Date = new Date()): number {
  if (!state.active || !state.endsAt) return 0;
  return Math.max(0, state.endsAt - now.getTime());
}
