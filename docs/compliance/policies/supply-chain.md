# Supply chain risk management policy (SR)

Maps to NIST 800-53 SR family, CSF GV.SC.

## Policy

1. Dependencies are pinned (lockfile) and kept current via automated update
   proposals.
2. Third-party binaries bundled with the app (Ollama) are verified against a
   pinned cryptographic digest before inclusion.
3. A Software Bill of Materials (SBOM) is generated for releases.
4. Build tooling versions are pinned (no unpinned `pnpm dlx` in release paths).

## Procedures

- Dependabot proposes npm + GitHub Actions updates (planned PM-003).
- `scripts/fetch-ollama.mjs` verifies SHA-256 and fails the build on mismatch;
  placeholder digests must be replaced with verified values (PM-009).
- SBOM via `@cyclonedx/cyclonedx-npm` pinned as a devDependency and produced in
  CI (PM-002/PM-009).

## Implementation references

- `pnpm-lock.yaml`, `package.json` (`sbom`, `audit:prod`),
  `scripts/fetch-ollama.mjs`, `.github/dependabot.yml` (planned).
