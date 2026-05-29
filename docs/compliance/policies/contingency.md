# Contingency & recovery policy (CP)

Maps to NIST 800-53 CP family, 800-171 3.8 (media), CSF RC.RP.

## Policy

1. Local data corruption must not cause silent loss of user mail or
   credentials.
2. In-flight operations (outbox sends) are recoverable across crashes.
3. Destructive migrations leave a recoverable backup.

## Procedures

- Stale "sending" outbox rows are recovered on startup
  (`apps/main/src/context.ts` `recoverStaleSending`).
- Schema/encryption migrations write timestamped backups; backups containing
  plaintext must be cleaned up after successful migration (POA&M PM-010).
- Users are responsible for OS-level backups of the user-data directory; the
  app does not operate a cloud backup (out of boundary).

## Implementation references

- `apps/main/src/context.ts`, `packages/storage/src/openEncryptedDb.ts`,
  `packages/storage/src/db.ts`.
