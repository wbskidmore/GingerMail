# System acquisition & secure SDLC policy (SA)

Maps to NIST 800-53 SA family (SA-10, SA-11, SA-15, SA-22), NIST SSDF
SP 800-218, CSF GV.SC / PR.PS.

## Policy

1. Security testing is part of the development lifecycle, not an afterthought.
2. Code changes are gated by automated checks (lint, typecheck, unit/security
   tests, dependency audit, SAST) before merge once CI is in place.
3. Unsupported or end-of-life components are tracked and replaced.

## Procedures

- CI (`.github/workflows/ci.yml`, planned PM-002) runs frozen install, lint,
  typecheck, test, `audit:prod`, and SBOM generation.
- SAST via CodeQL (planned PM-004).
- Security-relevant code paths carry regression tests (IPC guards, egress,
  scrub, mail sanitiser, iframe lint).

## Implementation references

- `package.json` scripts, `eslint.config.mjs`, `vitest.config.ts`,
  `playwright.config.ts`, `.github/` (planned).
