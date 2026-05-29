# Configuration management policy (CM)

Maps to NIST 800-53 CM family, 800-171 3.4, CSF PR.PS / ID.AM.

## Policy

1. Dependencies are pinned via `pnpm-lock.yaml`; the package manager version
   is pinned via `packageManager` in `package.json`.
2. The renderer runs with least functionality: strict CSP, navigation guards,
   denied permissions, and `<webview>` blocked.
3. Configuration and documentation must remain evidence-accurate: a control is
   documented as implemented only when the cited code implements it.
4. Distributed binaries must be code-signed before public release (POA&M
   PM-008).

## Procedures

- Dependency changes go through CI (`audit:prod`, lockfile check) once CI
  lands (POA&M PM-002).
- Security posture docs ([control-crosswalk.md](../control-crosswalk.md),
  [ssp.md](../ssp.md)) are updated alongside code changes.

## Implementation references

- `electron-builder.yml`, `package.json`, `pnpm-lock.yaml`,
  `apps/main/src/security/hardening.ts`.
