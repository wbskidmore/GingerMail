import type { ReactNode } from 'react';
export interface EmptyStateProps {
    icon: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}
/**
 * Centered, low-stimulation empty state. The same pattern in every tab gives
 * the app a predictable "nothing here yet" experience.
 */
export declare function EmptyState({ icon, title, description, action }: EmptyStateProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=EmptyState.d.ts.map