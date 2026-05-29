# System & information integrity policy (SI)

Maps to NIST 800-53 SI family, 800-171 3.14, CSF DE.CM / PR.PS.

## Policy

1. All untrusted input is validated or sanitized before use.
   - Mail HTML is sanitized (DOMPurify) and rendered in a `sandbox=""` iframe.
   - IPC inputs that mutate state or hit the network are validated against a
     zod schema via `safeHandle`.
2. Software updates are integrity-verified: SHA512 manifest plus a publisher
   signature requirement; a kill-switch can block a retired build.
3. Renderer-supplied filesystem paths are never trusted; file selection uses
   native dialogs.

## Procedures

- Adding a write/egress IPC channel requires a matching zod schema; an IPC
  coverage test enforces that write channels are validated (POA&M PM-006).
- `requireSignedUpdates` is enabled and the kill-switch is checked on both
  check and download paths (POA&M PM-007).

## Implementation references

- `packages/core/src/mailHtml.ts`, `apps/renderer/src/tabs/MailTab.tsx`,
  `apps/main/src/ipc/{guards,schemas,register}.ts`,
  `apps/main/src/autoUpdater.ts`.
