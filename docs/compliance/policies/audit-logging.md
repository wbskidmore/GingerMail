# Audit & accountability policy (AU)

Maps to NIST 800-53 AU family, 800-171 3.3, CSF DE.AE / PR.PS.

## Policy

1. Security-relevant events (IPC validation/sender failures, update actions,
   key generation, migration events) are logged via the central logger.
2. Logs must never contain secrets. A scrubbing layer is installed at process
   boot before any other logging can occur.
3. Audit breadcrumbs for rejected input record shape only (key names/types),
   never values.

## Procedures

- `installConsoleScrubbing()` and `wrapLoggerWithScrub()` run first in
  `apps/main/src/main.ts`.
- New token/secret formats are added to the scrub rule set
  (`apps/main/src/log/scrub.ts`); coverage gaps are tracked in POA&M PM-013.
- Logging changes include a test in `apps/main/src/log/scrub.test.ts`.

## Implementation references

- `apps/main/src/log/scrub.ts`, `apps/main/src/ipc/guards.ts` (`shapeOf`).
