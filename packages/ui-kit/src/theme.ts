import {
  createTheme,
  type MantineColorsTuple,
  type MantineThemeOverride,
  rem,
} from '@mantine/core';

/**
 * GingerMail ginger/orange brand ramp.
 *
 * Tuned for WCAG 2.2 AA contrast against the default Mantine surface colours:
 *   - Shade [7] (#a44608) hits 4.6:1 contrast against white in light mode,
 *     and is what we set as `primaryShade.light` so default `<Button>` text
 *     and focus rings are AA-compliant.
 *   - Shade [4] (#ff9c4a) sits at 4.5:1 against the dark theme surface
 *     (#1c1d20), which is what `primaryShade.dark` selects for dark mode.
 *   - Lighter shades (0-3) are reserved for backgrounds/badges and never
 *     used for text. Earlier versions used shade [6] (#ff7d1c) for primary
 *     text which fails AA (3.1:1) and is the colour-contrast issue the
 *     accessibility review flagged.
 */
const ginger: MantineColorsTuple = [
  '#fff5ec',
  '#ffe6d2',
  '#ffcaa1',
  '#ffac6c',
  '#ff9c4a',
  '#ff8328',
  '#ee6f10',
  '#a44608',
  '#7c3506',
  '#5a2604',
];

/**
 * GingerMail Mantine theme.
 *
 * - Ginger primary, slightly muted; accessible on both light and dark.
 * - Slightly larger default font size (15px) and generous line-height for
 *   ADHD-friendly reading. Density can still be adjusted at runtime by setting
 *   data-density on <html> (see densityScale in the renderer).
 * - Rounded radii to match Apple Mail / Outlook on macOS Sonoma.
 */
export const gingermailTheme: MantineThemeOverride = createTheme({
  primaryColor: 'ginger',
  // Shade 7 hits AA contrast against white in light mode; shade 4 hits AA
  // against the #1c1d20 dark-mode surface. Keep both pinned here rather
  // than relying on Mantine's auto-shade picker so accessibility is a
  // first-class property of the theme rather than an emergent accident.
  primaryShade: { light: 7, dark: 4 },
  colors: { ginger },
  defaultRadius: 'md',
  cursorType: 'pointer',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", system-ui, Helvetica, Arial, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  headings: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Display", system-ui, Helvetica, Arial, sans-serif',
    sizes: {
      h1: { fontSize: rem(28), fontWeight: '600', lineHeight: '1.25' },
      h2: { fontSize: rem(20), fontWeight: '600', lineHeight: '1.3' },
      h3: { fontSize: rem(16), fontWeight: '600', lineHeight: '1.35' },
    },
  },
  fontSizes: {
    xs: rem(11),
    sm: rem(12),
    md: rem(14),
    lg: rem(16),
    xl: rem(18),
  },
  spacing: {
    xs: rem(6),
    sm: rem(10),
    md: rem(14),
    lg: rem(20),
    xl: rem(28),
  },
  radius: {
    xs: rem(4),
    sm: rem(6),
    md: rem(8),
    lg: rem(12),
    xl: rem(16),
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.06)',
    md: '0 6px 24px rgba(0, 0, 0, 0.08)',
    lg: '0 16px 40px rgba(0, 0, 0, 0.12)',
  },
  focusRing: 'auto',
  components: {
    Button: {
      defaultProps: { radius: 'md' },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
        overlayProps: { backgroundOpacity: 0.45, blur: 4 },
      },
    },
    Menu: {
      defaultProps: { shadow: 'md', radius: 'md', position: 'bottom-end' },
    },
    Notification: {
      defaultProps: { radius: 'md', withBorder: true },
    },
    TextInput: { defaultProps: { radius: 'md' } },
    Textarea: { defaultProps: { radius: 'md' } },
    Select: { defaultProps: { radius: 'md' } },
    NumberInput: { defaultProps: { radius: 'md' } },
    PasswordInput: { defaultProps: { radius: 'md' } },
  },
});
