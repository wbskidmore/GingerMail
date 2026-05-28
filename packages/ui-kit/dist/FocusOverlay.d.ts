import { type FocusState } from '@gingermail/core';
export interface FocusOverlayProps {
    state: FocusState;
    onStop: () => void;
}
/**
 * Minimal, low-stimulation focus indicator. Anchored to the bottom-center
 * so it never obscures the active conversation/event/task.
 */
export declare function FocusOverlay({ state, onStop }: FocusOverlayProps): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=FocusOverlay.d.ts.map