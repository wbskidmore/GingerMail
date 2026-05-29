# System & communications protection policy (SC)

Maps to NIST 800-53 SC family, 800-171 3.13, CSF PR.DS / PR.IR.

## Policy

1. Sensitive data at rest is encrypted: the message cache with a 256-bit key,
   secrets in the OS keychain.
2. Network egress is constrained: cloud AI traffic is HTTPS-only and limited
   to an allowlist of vendor hosts; top-level navigation and `window.open` are
   blocked.
3. Cryptographic choices are explicit and documented; the at-rest cipher is
   pinned rather than relying on a library default (POA&M PM-012).
4. Encryption keys can be rotated (POA&M PM-011).

## Procedures

- DB key generated via CSPRNG on first launch and stored in `TokenVault`
  (`apps/main/src/context.ts`).
- Egress allowlist enforced (`apps/main/src/security/aiEgress.ts`); enforcement
  must cover the actual cloud fetch path (POA&M PM-016).

## Implementation references

- `packages/storage/src/openEncryptedDb.ts`, `apps/main/src/security/aiEgress.ts`,
  `apps/main/src/security/hardening.ts`, `apps/main/src/tokenVault.ts`.
