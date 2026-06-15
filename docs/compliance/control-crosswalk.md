# Control crosswalk and gap assessment

This crosswalk maps NIST SP 800-53 Rev5 controls (FedRAMP Moderate subset) to
their NIST SP 800-171 Rev3 requirement and NIST CSF 2.0 function, then to the
concrete GingerMail implementation and a status.

Status legend:

- **Implemented** - control objective met by cited code/process.
- **Partial** - partially met; residual work tracked in [poam.md](poam.md).
- **Planned** - not yet implemented; tracked in [poam.md](poam.md).
- **Inherited/External** - met by an out-of-boundary component or the host OS.
- **N/A (boundary)** - not applicable to a desktop-only boundary.

## Access Control (AC) / Identification & Authentication (IA)

| 800-53                        | 800-171     | CSF 2.0      | GingerMail implementation                                                                                           | Status                                                                        |
| ----------------------------- | ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AC-3, AC-4 Information flow   | 3.1.3       | PR.DS, PR.IR | AI egress allowlist `apps/main/src/security/aiEgress.ts`; cloud calls forced HTTPS + host allowlist                 | Partial (filter not on main-process fetch path)                               |
| AC-6 Least privilege          | 3.1.5       | PR.AA-05     | Renderer runs sandboxed, `contextIsolation`, `nodeIntegration:false` `apps/main/src/main.ts`; no renderer FS access | Implemented                                                                   |
| AC-6 (file perms)             | 3.1.5       | PR.DS        | Local vault/DB/prefs file permissions in user-data dir                                                              | Planned (no chmod hardening)                                                  |
| AC-12 Session termination     | 3.1.11      | PR.AA        | OAuth token lifecycle; Microsoft access token expiry                                                                | Partial (no MS refresh-token persistence, `apps/main/src/oauth/microsoft.ts`) |
| IA-2, IA-5 Authenticator mgmt | 3.5.1-3.5.2 | PR.AA-01/02  | OAuth PKCE S256 + state nonce `apps/main/src/oauth/{google,microsoft,loopback}.ts`                                  | Implemented                                                                   |
| IA-5 Authenticator storage    | 3.5.10      | PR.AA, PR.DS | Secrets in OS keychain via `apps/main/src/tokenVault.ts` (`safeStorage`)                                            | Partial (silent plaintext fallback)                                           |

## Audit & Accountability (AU)

| 800-53                        | 800-171 | CSF 2.0      | GingerMail implementation                                                                           | Status                                                                     |
| ----------------------------- | ------- | ------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| AU-2, AU-3 Event logging      | 3.3.1   | DE.AE, PR.PS | electron-log + structured warnings across main process                                              | Partial (no audit retention policy)                                        |
| AU-9 Protection of audit info | 3.3.8   | PR.DS-01     | Secret-scrubbing logger `apps/main/src/log/scrub.ts` (Bearer/Basic/JWT/long-hex/JSON secret fields) | Partial (coverage holes: `sk-ant-`, `ghp_`, 32-39 char hex, renderer logs) |

## Configuration Management (CM) / System & Services Acquisition (SA)

| 800-53                       | 800-171     | CSF 2.0      | GingerMail implementation                                                                   | Status                                               |
| ---------------------------- | ----------- | ------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| CM-2 Baseline config         | 3.4.1       | ID.AM, PR.PS | `electron-builder.yml`, `package.json` (`packageManager` pin), `pnpm-lock.yaml`             | Partial (docs drift overstated CI; being corrected)  |
| CM-7 Least functionality     | 3.4.6/3.4.7 | PR.PS-01     | CSP + nav guards + permission denial `apps/main/src/security/hardening.ts`; webview blocked | Implemented                                          |
| CM-14 Signed components      | 3.4.x       | PR.PS-02     | Code signing/notarization                                                                   | Planned (`identity: null` in `electron-builder.yml`) |
| SA-10 Developer config mgmt  | -           | PR.PS        | Lockfile + pinned package manager; build scripts in `scripts/`                              | Partial                                              |
| SA-11 Developer testing      | -           | ID.RA, PR.PS | Vitest security tests (guards, egress, scrub, sanitiser, iframe lint); Playwright e2e       | Partial (not gated by CI; no SAST)                   |
| SA-15 Dev process            | -           | GV.SC        | SDLC documented in `docs/security-hardening.md`                                             | Partial                                              |
| SA-22 Unsupported components | 3.4.x       | ID.RA        | Dependency currency                                                                         | Planned (no Dependabot/Renovate)                     |

## Risk Assessment (RA) / Supply Chain (SR)

| 800-53                       | 800-171 | CSF 2.0  | GingerMail implementation                            | Status                                             |
| ---------------------------- | ------- | -------- | ---------------------------------------------------- | -------------------------------------------------- |
| RA-5 Vulnerability scanning  | 3.11.2  | ID.RA-01 | `pnpm audit:prod` script in `package.json`           | Partial (manual only, not in CI)                   |
| SR-3 Supply chain controls   | -       | GV.SC-01 | Lockfile, pinned pnpm, build scripts                 | Partial                                            |
| SR-4 Provenance              | -       | GV.SC-07 | SBOM script (`sbom`, `@cyclonedx/cdxgen`)            | Partial (CycloneDX JSON generated in CI on `main`) |
| SR-11 Component authenticity | -       | GV.SC-08 | Ollama binary SHA-256 pin `scripts/fetch-ollama.mjs` | Partial (placeholder SHAs)                         |

## System & Communications Protection (SC)

| 800-53                            | 800-171 | CSF 2.0  | GingerMail implementation                                                                        | Status                                                                                  |
| --------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| SC-7 Boundary protection          | 3.13.1  | PR.IR-01 | Egress allowlist + nav guards + `window.open` deny                                               | Partial                                                                                 |
| SC-8 Transmission confidentiality | 3.13.8  | PR.DS-02 | HTTPS enforced for cloud AI / unsubscribe; provider TLS                                          | Implemented                                                                             |
| SC-12 Key establishment           | 3.13.10 | PR.DS-01 | 256-bit DB key via CSPRNG `packages/storage/src/openEncryptedDb.ts` `generateEncryptionKeyHex()` | Partial (no rotation)                                                                   |
| SC-13 Cryptographic protection    | 3.13.11 | PR.DS-01 | `better-sqlite3-multiple-ciphers` AEAD cipher                                                    | Partial (cipher not explicitly pinned; docs say "SQLCipher" but driver default differs) |
| SC-18 Mobile code                 | 3.13.13 | PR.PS    | Renderer CSP, mail body `sandbox=""` iframe `apps/renderer/src/tabs/MailTab.tsx`                 | Implemented                                                                             |
| SC-28 Data at rest                | 3.13.16 | PR.DS-01 | Encrypted SQLite cache; secrets vault                                                            | Partial (plaintext migration backups; prefs plaintext; fallback)                        |

## System & Information Integrity (SI)

| 800-53                         | 800-171 | CSF 2.0      | GingerMail implementation                                                                         | Status                                                                                                |
| ------------------------------ | ------- | ------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SI-2 Flaw remediation          | 3.14.1  | ID.RA, RS.MI | Auto-updater opt-in `apps/main/src/autoUpdater.ts`; incident response `docs/incident-response.md` | Partial (no CI dependency gate)                                                                       |
| SI-3 Malicious code protection | 3.14.2  | DE.CM        | DOMPurify mail sanitization `packages/core/src/mailHtml.ts` + renderer/main sanitisers            | Implemented                                                                                           |
| SI-7 Software integrity        | 3.14.x  | PR.DS-06     | Update manifest SHA512 (electron-updater); kill-switch                                            | Partial (`requireSignedUpdates` documented but not in code; unsigned binaries)                        |
| SI-10 Input validation         | 3.14.x  | PR.PS        | IPC sender guard + zod `apps/main/src/ipc/{guards,schemas}.ts`                                    | Partial (schemas defined but not wired to mail/write channels; `.passthrough()` on settings/accounts) |

## Incident Response (IR) / Contingency (CP)

| 800-53                       | 800-171 | CSF 2.0      | GingerMail implementation                                           | Status                                    |
| ---------------------------- | ------- | ------------ | ------------------------------------------------------------------- | ----------------------------------------- |
| IR-1/IR-4/IR-8 IR plan       | 3.6.1   | RS.MA, RS.AN | `docs/incident-response.md` (severity ladder, kill-switch)          | Partial (roster TBD, no post-mortems dir) |
| IR-6 Reporting               | 3.6.2   | RS.CO        | `SECURITY.md`, `public/.well-known/security.txt`                    | Implemented                               |
| CP-9/CP-10 Backup & recovery | 3.8.9   | RC.RP        | Outbox crash recovery `apps/main/src/context.ts`; migration backups | Partial                                   |

## Program / Governance (PM, CA, PL)

| 800-53                     | CSF 2.0 | GingerMail implementation                                                  | Status                          |
| -------------------------- | ------- | -------------------------------------------------------------------------- | ------------------------------- |
| PL-2 System security plan  | GV.OC   | [ssp.md](ssp.md)                                                           | Implemented (scaffold)          |
| CA-5 POA&M                 | GV.RM   | [poam.md](poam.md)                                                         | Implemented                     |
| CA-7 Continuous monitoring | DE.CM   | [assessment/continuous-monitoring.md](assessment/continuous-monitoring.md) | Partial (depends on CI landing) |
| RA-3 Risk assessment       | ID.RA   | [threat-model.md](threat-model.md)                                         | Implemented                     |
| PM-5 / policies            | GV      | [policies/](policies/)                                                     | Implemented (scaffold)          |

## Summary of gaps

The crosswalk surfaces these open items, prioritized and detailed in
[poam.md](poam.md):

- P0: documentation drift (CM-2), no CI/SAST/dependency gate (RA-5, SA-11),
  silent plaintext secrets fallback (SC-28/IA-5).
- P1: unwired IPC schemas (SI-10), unimplemented `requireSignedUpdates`
  (SI-7), unsigned binaries (CM-14), placeholder Ollama SHAs (SR-11), file
  permission + migration backup hygiene (SC-28).
- P2: key rotation (SC-12), explicit cipher pinning (SC-13), log scrubber
  coverage (AU-9), IR roster (IR-7), MS refresh tokens (AC-12).
