# GingerMail security policy

We take security seriously because GingerMail handles email, the most
sensitive workflow most people have on their computer.

## Supported versions

| Version | Status |
|---------|--------|
| 1.x     | Supported with security patches |
| < 1.0   | Pre-release; not supported. Please upgrade. |

## How to report a vulnerability

**Please do not file public GitHub issues for security bugs.**

Email **security@gingermail.app** with:

- A description of the issue, ideally with reproduction steps.
- The version of GingerMail you tested (Settings → About).
- Your operating system + version.
- Whether the bug requires user interaction, what kind, and how likely
  it is in the wild.
- (Optional) a suggested fix.

If you'd like to use PGP, our key is published at
<https://gingermail.app/security/pgp.asc> (fingerprint published at the
same URL).

### What to expect

- We acknowledge new reports within **2 business days**.
- We aim to ship a fix within **30 days** for High/Critical issues.
- We credit reporters in the release notes unless you ask us not to.
- We do not currently run a paid bounty program.

## In-scope

- The desktop application (Mac + Windows).
- The auto-update channel (`updates.gingermail.app`).
- Anything in this repo, including build scripts and CI workflows.

## Out-of-scope

- Third-party mail providers (report to Google/Microsoft/Apple).
- Third-party AI vendors (report to OpenAI/Anthropic/Google).
- Self-hosted Ollama (report upstream to ollama/ollama).
- Findings that require physical access to an unlocked device.
- Findings that require local-admin / root privileges.

## Hardening already in place (v1.0)

For reviewers planning a quick audit, the highest-impact protections
live here:

| Concern | Location |
|---------|----------|
| At-rest DB encryption (SQLCipher) | `packages/storage/src/openEncryptedDb.ts` |
| Secret-scrubbing logger          | `apps/main/src/log/scrub.ts` |
| Renderer CSP + nav guards        | `apps/main/src/security/hardening.ts` |
| Mail-body iframe sandbox=""      | `apps/renderer/src/tabs/MailTab.tsx` + lint test |
| OAuth PKCE + state nonce         | `apps/main/src/oauth/{google,microsoft,loopback}.ts` |
| AI egress allowlist              | `apps/main/src/security/aiEgress.ts` |
| IPC sender guard + zod validation| `apps/main/src/ipc/{guards,schemas}.ts` |
| Auto-updater opt-in + kill-switch| `apps/main/src/autoUpdater.ts` |

## Incident response

See [docs/incident-response.md](docs/incident-response.md).
