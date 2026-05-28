import type { SVGProps } from 'react';
type IconName = 'mail' | 'calendar' | 'check' | 'star' | 'star-filled' | 'flag' | 'snooze' | 'reply' | 'forward' | 'trash' | 'archive' | 'search' | 'settings' | 'sparkles' | 'focus' | 'plus' | 'inbox' | 'send';
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
    name: IconName;
    size?: number;
}
export declare function Icon({ name, size, ...rest }: IconProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Icon.d.ts.map