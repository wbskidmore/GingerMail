export interface FocusState {
    active: boolean;
    endsAt?: number;
    startedAt?: number;
    breakReminderAt?: number;
}
export declare function createFocusState(durationMin: number, breakEveryMin?: number, now?: Date): FocusState;
export declare function isFocusExpired(state: FocusState, now?: Date): boolean;
export declare function focusRemainingMs(state: FocusState, now?: Date): number;
//# sourceMappingURL=focus.d.ts.map