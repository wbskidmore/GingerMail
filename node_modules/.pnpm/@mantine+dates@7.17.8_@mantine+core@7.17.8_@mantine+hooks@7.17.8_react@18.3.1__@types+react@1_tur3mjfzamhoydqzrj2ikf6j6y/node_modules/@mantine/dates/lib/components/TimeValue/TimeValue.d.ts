import type { TimePickerAmPmLabels, TimePickerFormat } from '../TimePicker';
export interface TimeValueProps {
    /** Time to format */
    value: string | Date;
    /** Time format, `'24h'` by default */
    format?: TimePickerFormat;
    /** AM/PM labels, `{ am: 'AM', pm: 'PM' }` by default */
    amPmLabels?: TimePickerAmPmLabels;
    /** Determines whether seconds should be displayed, `false` by default */
    withSeconds?: boolean;
}
export declare function TimeValue({ value, format, amPmLabels, withSeconds, }: TimeValueProps): import("react/jsx-runtime").JSX.Element;
export declare namespace TimeValue {
    var displayName: string;
}
