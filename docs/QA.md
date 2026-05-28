# GingerMail QA + UI/UX notes

This doc records the QA pass that accompanied the Mantine migration. It is
maintained by the QA engineer + UI/UX expert on the team.

## Stack

- **Design system**: [Mantine v7](https://mantine.dev). Adopted in full for
  AppShell, Tabs, Modal, Menu, Notifications, Forms, Inputs, Buttons, Badges,
  Tooltips, ScrollArea, SegmentedControl, NavLink, Avatar, ThemeIcon.
- **Icons**: [`@tabler/icons-react`](https://tabler.io/icons). Replaces the
  hand-rolled SVG `Icon` component.
- **Dates**: `@mantine/dates` + `dayjs` (week / month view formatting).
- **Notifications**: `@mantine/notifications` (replaces every `alert(...)`).
- **Modals**: `@mantine/modals` (replaces ad-hoc popovers and `window.confirm`).
- **Forms**: `@mantine/form` for validated inputs in the manual account flow.

## UI/UX audit findings (before migration)

| #   | Severity | Area          | Finding                                                          | Resolved by                                                          |
| --- | -------- | ------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Q1  | High     | Mail tab      | Fixed 260/360 columns; no resize.                                | Mantine `AppShell` + CSS grid columns; responsive default.           |
| Q2  | High     | Composer      | `alert(...)` used for AI summary output.                         | `modals.open(...)` with formatted Stack + Divider.                   |
| Q3  | High     | Errors        | `alert(...)` used for OAuth failures.                            | `notifications.show(... color: 'red')`.                              |
| Q4  | High     | Snooze        | Absolute-positioned div; no focus trap, ESC, click-outside.      | Mantine `Menu` with arrow + keyboard nav + auto-dismiss.             |
| Q5  | Medium   | Settings      | Bare `<input>`s, no labels, no validation.                       | Mantine `TextInput`/`PasswordInput`/`Select` + `@mantine/form`.      |
| Q6  | Medium   | Navigation    | Tabs not keyboard-navigable.                                     | Mantine `Tabs` (arrow keys built in) + `Cmd/Ctrl+Shift+F` hotkey.    |
| Q7  | Medium   | Theming       | CSS variables drifting from OS feel.                             | Mantine theme + ginger primary; `--mantine-color-*` tokens.          |
| Q8  | Medium   | Calendar      | "Drag task to time-block" missing.                               | Tracked as follow-up: `mantine-cal-dnd` (deferred).                  |
| Q9  | Low      | Iconography   | Hand-rolled SVGs inconsistent stroke widths.                     | `@tabler/icons-react` (1.5px stroke standard).                       |
| Q10 | Low      | A11y          | Missing `aria-label`s, browser focus rings.                      | All `ActionIcon`s have explicit `aria-label`; visible focus ring CSS.|
| Q11 | Low      | Density       | "Compact/Cozy/Spacious" tokens applied inconsistently.           | `densityScale.ts` in ui-kit, single source.                          |
| Q12 | Low      | Test coverage | Only 12 unit tests, no component / e2e.                          | 22 unit + component tests; Playwright smoke spec.                    |

## Test infrastructure

```
test/setup.ts                       Shared Vitest setup (matchMedia, RO, cleanup)
vitest.config.ts                    Workspace-root config (node tests)
apps/renderer/vitest.config.ts      jsdom + plugin-react for renderer tests
packages/ui-kit/vitest.config.ts    jsdom + plugin-react for ui-kit tests
playwright.config.ts                Playwright config (Chromium against Vite)
e2e/smoke.spec.ts                   Playwright smoke test for tabs + focus mode
```

Run locally:

```bash
pnpm test          # all packages, unit + component tests
pnpm test:e2e      # Playwright smoke against renderer (requires `pnpm dev`)
```

## Coverage at the time of writing

| Suite                                | Tests | Notes                                                              |
| ------------------------------------ | ----- | ------------------------------------------------------------------ |
| `packages/core/src/snooze.test.ts`   | 6     | All snooze presets.                                                |
| `packages/core/src/focus.test.ts`    | 4     | Focus state lifecycle.                                             |
| `packages/providers/.../parser.test` | 2     | RFC 822 parser.                                                    |
| `packages/ui-kit/EnergyChip.test`    | 2     | Labels + nothing-when-undefined.                                   |
| `packages/ui-kit/AccountBadge.test`  | 2     | Initials + email-fallback.                                         |
| `packages/ui-kit/SnoozeMenu.test`    | 1     | Opens, selects, returns preset id + computed fire time.            |
| `packages/ui-kit/FocusOverlay.test`  | 2     | Hidden when off, stop callback when on.                            |
| `apps/renderer/App.test`             | 3     | Boots, switches to Tasks + Settings, mock IPC.                     |
| `e2e/smoke.spec.ts`                  | 2     | Tabs render, focus mode overlay toggles.                           |
| **Total**                            | **24**| 22 unit/component + 2 e2e.                                         |

## Mantine theme

The theme lives in `packages/ui-kit/src/theme.ts` and is the single source of
truth for colours, radii, spacing, and component defaults.

Defaults are chosen to be ADHD-friendly:

- Body font 14px (15px is the perceived default after the 0.875rem scale).
- Generous line-height for headings (1.25 / 1.30 / 1.35).
- Soft shadows (no harsh borders), `defaultRadius: 'md'`.
- Pointer cursor on interactive controls.
- `focusRing: 'auto'` so keyboard users always see where they are.

Density and the dyslexic-friendly font are layered on top via
`data-density` / `data-font` on `<html>` and a small `theme.css` in ui-kit.

## What's still pending

- Drag-and-drop in the Calendar tab (Q8) — needs `@dnd-kit` or HTML5 DnD wired
  to a `createEvent` mutation. Mantine ships nothing for this directly.
- A real Electron-driven Playwright suite (currently the smoke runs against
  the renderer in a regular Chromium tab using the mock IPC bridge).
- Visual regression baseline (Chromatic or Percy) for the design system once
  the mail thread fixtures are seeded.
