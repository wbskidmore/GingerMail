# Risk assessment policy (RA)

Maps to NIST 800-53 RA family, 800-171 3.11, CSF ID.RA.

## Policy

1. A threat model is maintained for the desktop boundary and revisited each
   release and whenever a new trust boundary is added.
2. Dependencies are scanned for known vulnerabilities; high/critical findings
   block release once CI is in place.

## Procedures

- Threat model: [threat-model.md](../threat-model.md).
- Vulnerability scanning: `pnpm audit:prod` (manual today; CI-gated per POA&M
  PM-002). Dependabot proposes dependency updates (POA&M PM-003).
- Findings are recorded as POA&M entries with severity and milestone.

## Implementation references

- [threat-model.md](../threat-model.md), `package.json` (`audit:prod`),
  `.github/dependabot.yml` (planned), `.github/workflows/ci.yml` (planned).
