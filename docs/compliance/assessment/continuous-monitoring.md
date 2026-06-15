# Continuous monitoring

Supports NIST CA-7, CSF DE.CM / GV.RM.

## Cadence

| Activity                                 | Frequency                   | Mechanism                                                                  |
| ---------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Lint / typecheck / unit + security tests | Every push/PR               | CI (`.github/workflows/ci.yml`, planned PM-002)                            |
| SAST (CodeQL)                            | Every push/PR + weekly      | CodeQL workflow (planned PM-004)                                           |
| Dependency vulnerability scan            | Every PR + weekly           | `pnpm audit:prod` in CI + Dependabot (PM-002/PM-003)                       |
| SBOM generation                          | Every release               | `@cyclonedx/cdxgen` in CI (PM-009)                                         |
| Threat model review                      | Each release / new boundary | [../threat-model.md](../threat-model.md)                                   |
| Control crosswalk + SSP review           | Each release                | [../control-crosswalk.md](../control-crosswalk.md), [../ssp.md](../ssp.md) |
| POA&M review                             | Monthly                     | [../poam.md](../poam.md)                                                   |
| Dependency currency review               | Monthly                     | Dependabot PR queue                                                        |

## Metrics tracked

- Open POA&M count by priority and age.
- High/critical dependency findings (target: zero at release).
- Test/lint pass rate on main.
- Time-to-fix against the incident-response SLAs.

## Reporting

Self-assessment results are recorded per release under this `assessment/`
directory. Until CI lands, the cadence above is performed manually and noted
in the release checklist.
