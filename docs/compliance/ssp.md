# System Security Plan (SSP) - GingerMail desktop client

Supports NIST PL-2. This scaffold follows the FedRAMP SSP structure and is
organized so it can be converted to OSCAL (`system-security-plan`) later. It
is a self-assessment artifact, not an authorization package (see the FedRAMP
applicability note in [README.md](README.md)).

## 1. System identification

- System name: GingerMail desktop client.
- System owner / ISSO: GitHub repository owner of record (see
  [docs/incident-response.md](../incident-response.md) roster - TBD,
  POA&M PM-014).
- System type: Locally installed cross-platform (macOS/Windows/Linux) Electron
  desktop application. **Not** a cloud service offering.
- Version baseline: see `package.json` `version` and `electron-builder.yml`.

## 2. System categorization (FIPS 199 / SP 800-60)

Information types processed locally:

- Personal email content and contacts (A1) - confidentiality **Moderate**,
  integrity Moderate, availability Low.
- Authentication secrets / tokens (A2-A4) - confidentiality **High**,
  integrity Moderate, availability Low.

Overall categorization for the endpoint: **Moderate** (driven by the
sensitivity of cached mail and stored credentials). This justifies assessing
against the FedRAMP Moderate control selection.

## 3. Authorization boundary

See the boundary diagram in [README.md](README.md). In scope: `apps/main`,
`apps/renderer`, `packages/*`, and local stores `gingermail.sqlite`,
`gingermail.vault.json`, `gingermail-prefs.json`.

### Interconnections (external systems)

| External system | Data exchanged | Protection |
|-----------------|----------------|------------|
| Mail providers (Gmail/Graph/Apple/IMAP/SMTP/POP3) | Credentials, mail | TLS; OAuth PKCE where supported |
| Cloud AI vendors (opt-in) | Selected message text + prompt | HTTPS, host allowlist, optional PII redaction, sensitive-account block |
| `updates.gingermail.app` (opt-in) | App version/OS/arch; installer download | HTTPS; SHA512 manifest; (planned) signature requirement |
| Local Ollama sidecar | Prompt/response | Loopback `127.0.0.1` only |

### Boundary expansion required for a real FedRAMP ATO

A FedRAMP authorization needs an operated cloud boundary. If GingerMail later
adds a hosted sync/backend or treats `updates.gingermail.app` as the CSO, the
following families shift to that cloud boundary and must be implemented there:
AC (server-side authZ), AU (centralized audit), CP (cloud backup/DR), SC-7
(cloud boundary protection), SI-4 (cloud intrusion detection), and the
FedRAMP-specific continuous-monitoring deliverables.

## 4. Control implementation summaries

Per-family summaries. "Status" mirrors [control-crosswalk.md](control-crosswalk.md);
residual work is in [poam.md](poam.md).

### AC / IA - Access control & identification

The renderer is sandboxed (`contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`; `apps/main/src/main.ts`) and never receives secrets
(`apps/main/src/context.ts` `getSettingsForRenderer`). Authentication to mail
providers uses OAuth 2.0 with PKCE S256 and a per-attempt `state` nonce
(`apps/main/src/oauth/{google,microsoft,loopback}.ts`). Secrets are stored in
the OS keychain via Electron `safeStorage` (`apps/main/src/tokenVault.ts`).
Status: Partial (PM-005 plaintext fallback, PM-010 file perms, PM-015 MS
refresh).

### AU - Audit & accountability

Application logging via electron-log with a secret-scrubbing layer installed at
boot (`apps/main/src/log/scrub.ts`) that redacts bearer/basic auth, API-key
headers, JWTs, long hex, and JSON secret fields. IPC validation failures log
shape-only breadcrumbs, never values (`apps/main/src/ipc/guards.ts`). Status:
Partial (PM-013 scrub coverage).

### CM / SA - Configuration management & acquisition

Reproducible installs via `pnpm-lock.yaml` and pinned `packageManager`. Build
configuration in `electron-builder.yml`. Security unit tests exist (IPC guards,
egress, scrub, sanitiser, iframe lint). Status: Partial (PM-002 CI gate,
PM-004 SAST, PM-008 signing).

### RA / SR - Risk assessment & supply chain

Risk assessment captured in [threat-model.md](threat-model.md). Dependency
audit script `audit:prod` and SBOM scripts exist in `package.json`. Ollama
binaries pinned by SHA-256 (`scripts/fetch-ollama.mjs`). Status: Partial
(PM-002/PM-003/PM-009).

### SC - System & communications protection

Data at rest: encrypted SQLite cache (`packages/storage/src/openEncryptedDb.ts`,
256-bit CSPRNG key). Boundary protection: CSP + navigation guards + permission
denial + `window.open` deny (`apps/main/src/security/hardening.ts`); AI egress
allowlist (`apps/main/src/security/aiEgress.ts`). Transmission: HTTPS enforced
for cloud AI and unsubscribe. Status: Partial (PM-011 rotation, PM-012 cipher,
PM-016 egress path).

### SI - System & information integrity

Untrusted mail HTML is sanitized (DOMPurify, `packages/core/src/mailHtml.ts`)
and rendered in a locked-down `sandbox=""` iframe
(`apps/renderer/src/tabs/MailTab.tsx`). Input validation via zod
(`apps/main/src/ipc/schemas.ts`). Update integrity via SHA512 manifests +
kill-switch (`apps/main/src/autoUpdater.ts`). Status: Partial (PM-006 IPC
wiring, PM-007 signed updates).

### IR / CP - Incident response & contingency

Incident response runbook with severity ladder and kill-switch
(`docs/incident-response.md`). Disclosure surface: `SECURITY.md`,
`public/.well-known/security.txt`. Outbox crash recovery in
`apps/main/src/context.ts`. Status: Partial (PM-014 roster/post-mortems).

## 5. Roles and responsibilities

Until a security team roster exists (PM-014), the maintainer of record holds
the system owner, ISSO, and incident-commander roles. See
[policies/](policies/) for per-family responsibilities.

## 6. Plan maintenance

This SSP is updated whenever a control implementation changes, a new
interconnection is added, or a POA&M item is opened/closed. See the
maintenance steps in [README.md](README.md).
