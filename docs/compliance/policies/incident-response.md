# Incident response policy (IR)

Maps to NIST 800-53 IR family, 800-171 3.6, CSF RS / RC.

The operational runbook lives at
[docs/incident-response.md](../../incident-response.md) and is the source of
truth for severity definitions, time-to-fix targets, the kill-switch
procedure, and the post-mortem process. This policy file records the control
intent and open items.

## Policy

1. Vulnerabilities are reported privately (`SECURITY.md`,
   `public/.well-known/security.txt`); public issues are not used for
   security bugs.
2. Severity is triaged on the SEV-1..SEV-4 ladder with defined first-fix
   targets.
3. A kill-switch (`0.0.0-killswitch` update manifest) can retire a compromised
   build.

## Open items (POA&M PM-014)

- Define a named responder roster (currently "maintainer of record").
- Create `docs/post-mortems/` with a template.

## Implementation references

- `docs/incident-response.md`, `apps/main/src/autoUpdater.ts` (kill-switch),
  `SECURITY.md`.
