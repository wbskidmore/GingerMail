import type { HTMLAttributes, ReactNode } from 'react';
export interface PaneProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    title?: ReactNode;
    actions?: ReactNode;
    scrollable?: boolean;
    variant?: 'sidebar' | 'list' | 'content';
}
export declare function Pane({ title, actions, scrollable, variant, className, children, ...rest }: PaneProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Pane.d.ts.map