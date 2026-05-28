interface TimeControlsListProps {
    min: number;
    max: number;
    step: number;
    value: number | null;
    onSelect: (value: number) => void;
}
export declare function TimeControlsList({ min, max, step, value, onSelect }: TimeControlsListProps): import("react/jsx-runtime").JSX.Element;
export declare namespace TimeControlsList {
    var displayName: string;
}
export {};
