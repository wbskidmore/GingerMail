# Access control & identification policy (AC / IA)

Maps to NIST 800-53 AC and IA families, 800-171 3.1/3.5, CSF PR.AA.

## Policy

1. The renderer process is untrusted for privilege purposes. It runs with
   `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`,
   and must never be granted direct filesystem, shell, or secret access.
2. All privileged operations cross the IPC boundary and are subject to the
   sender guard and input validation (see [system-integrity.md](system-integrity.md)).
3. Secrets (account credentials, OAuth tokens, DB key, cloud AI key) are
   stored only in the OS keychain via Electron `safeStorage`. Plaintext
   storage of secrets is prohibited except behind an explicit, documented
   developer opt-in.
4. Provider authentication uses OAuth 2.0 with PKCE (S256) and a per-attempt
   `state` nonce wherever the provider supports it.
5. Secrets must never cross the IPC boundary to the renderer.

## Procedures

- New IPC channels handling state changes or network egress are registered
  with `safeHandle` and a zod schema.
- Credential writes go through `TokenVault`; never persisted to
  `gingermail-prefs.json`.
- Local secret files are created with owner-only permissions (chmod 600;
  POA&M PM-010).

## Implementation references

- `apps/main/src/main.ts` (webPreferences), `apps/main/src/context.ts`
  (settings stripping), `apps/main/src/tokenVault.ts`,
  `apps/main/src/oauth/*`.
