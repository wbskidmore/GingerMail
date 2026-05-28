import { BoxProps, CloseButtonProps, DataAttributes, ElementProps, Factory, PopoverProps, StylesApiProps } from '@mantine/core';
export type DateInputMaskStylesNames = 'fieldsRoot';
export type DateInputMaskVariant = string;
export interface DateInputMaskProps extends BoxProps, StylesApiProps<DateInputMaskFactory>, ElementProps<'div', 'onChange' | 'value' | 'defaultValue'> {
    /** Controlled component value */
    value?: Date | null;
    /** Uncontrolled component default value */
    defaultValue?: Date | null;
    /** Called when the value changes */
    onChange?: (value: Date | null) => void;
    /** Determines whether the clear button should be displayed, `false` by default */
    clearable?: boolean;
    /** Called once when one of the inputs is focused, not called when focused is shifted between hours, minutes, seconds and am/pm inputs */
    onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
    /** Called once when the focus is no longer on any of the inputs */
    onBlur?: (event: React.FocusEvent<HTMLDivElement>) => void;
    /** If set, the value cannot be updated */
    readOnly?: boolean;
    /** If set, the component becomes disabled */
    disabled?: boolean;
    /** `name` prop passed down to the hidden input */
    name?: string;
    /** `form` prop passed down to the hidden input */
    form?: string;
    /** Props passed down to the hidden input */
    hiddenInputProps?: React.ComponentPropsWithoutRef<'input'> & DataAttributes;
    /** `aria-label` of days input */
    daysInputLabel?: string;
    /** `aria-label` of months input */
    monthsInputLabel?: string;
    /** `aria-label` of years input */
    yearsInputLabel?: string;
    /** Determines whether the dropdown with calendar should be visible when the input has focus, `false` by default */
    withDropdown?: boolean;
    /** Props passed down to `Popover` component */
    popoverProps?: PopoverProps;
    /** Props passed down to clear button */
    clearButtonProps?: CloseButtonProps & ElementProps<'button'> & DataAttributes;
    /** Props passed down to days input */
    daysInputProps?: React.ComponentPropsWithoutRef<'input'> & DataAttributes;
    /** Props passed down to months input */
    monthsInputProps?: React.ComponentPropsWithoutRef<'input'> & DataAttributes;
    /** Props passed down to years input */
    yearsInputProps?: React.ComponentPropsWithoutRef<'input'> & DataAttributes;
    /** A ref object to get node reference of the days input */
    daysRef?: React.Ref<HTMLInputElement>;
    /** A ref object to get node reference of the months input */
    monthsRef?: React.Ref<HTMLInputElement>;
    /** A ref object to get node reference of the years input */
    yearsRef?: React.Ref<HTMLInputElement>;
}
export type DateInputMaskFactory = Factory<{
    props: DateInputMaskProps;
    ref: HTMLDivElement;
    stylesNames: DateInputMaskStylesNames;
    variant: DateInputMaskVariant;
}>;
export declare const DateInputMask: import("@mantine/core").MantineComponent<{
    props: DateInputMaskProps;
    ref: HTMLDivElement;
    stylesNames: DateInputMaskStylesNames;
    variant: DateInputMaskVariant;
}>;
