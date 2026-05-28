# Incident response runbook

This runbook is for the maintainer on-call when a security issue is
reported or detected.

It assumes one or two people respond. Adjust headcount as needed.

## Severity ladder

| Sev | Definition | Example | Target time to first fix |
|-----|-----------|---------|-------------------------|
| SEV-1 | Active exploitation OR likely RCE / token theft in the wild | A drive-by HTML email steals OAuth tokens | < 24 h ship + kill-switch |
| SEV-2 | Privilege escalation, data exfil, or auth bypass that's exploitable but not seen in the wild | Loopback OAuth listener accepts arbitrary state | < 7 d ship |
| SEV-3 | Local-only or attacker-with-physical-access issues | Disk-cached body readable by another OS user via lax `~/Library` perms | < 30 d ship |
| SEV-4 | Hardening gap with no clear exploit | Missing `X-Content-Type-Options` on a static asset | Next regular release |

## First 30 minutes

1. **Acknowledge** the report (email reply). Don't ask for more detail
   yet — get a working repro first if you can.
2. **Triage** the severity. Bias to the higher number if uncertain.
3. **Open a private fork branch** with `sec/` prefix. Do not push the
   exploit detail to the public repo until the patch ships.
4. If SEV-1: **flip the kill-switch** by publishing a `latest.yml`
   manifest whose `version` is `0.0.0-killswitch` to the update channel.
   This causes `setupAutoUpdater()` in opted-in clients to surface a
   blocking notification and refuse to apply it. See
   `apps/main/src/autoUpdater.ts`.
5. **Notify** the security mailing list (when one exists) with a
   one-paragraph summary. No exploit details, just "issue identified,
   patch in progress, ETA <date>".

## Patching

1. **Reproduce** locally. Write a test that fails on `main` before the
   patch and passes after.
2. **Patch** with the smallest possible diff. Avoid refactors in the
   same PR.
3. **Test plan** that includes the new test, full unit suite, and
   manual repro of the original issue.
4. **Backport** if relevant (we only support latest 1.x, so usually
   not).
5. **Code-sign + notarize** the release exactly like a normal one. If
   the cert is unavailable, ship an unsigned hotfix only as a last
   resort and document in the release notes.

## Disclosure

- Default policy: coordinated disclosure 90 days after the patch ships.
- If the issue is already being exploited, disclosure can be reduced to
  whatever protects users best (usually "as soon as the auto-update
  has had 48 h to roll out").
- Credit reporters in the GitHub release notes unless they opt out.
- File a CVE for SEV-1 and SEV-2 via GitHub's CVE Assigner integration.

## Kill-switch reference

The kill-switch is intentionally simple:

1. The auto-updater treats `0.0.0-killswitch` as a sentinel — it does
   NOT apply that "update", but the very act of advertising it tells
   the client to surface a blocking modal asking the user to reinstall
   from gingermail.app.
2. Trigger by publishing a `latest.yml` to
   `updates.gingermail.app/latest/{os}/{arch}/latest.yml` whose
   `version` field is `0.0.0-killswitch`.
3. Revert by re-publishing the real `latest.yml` for the current
   shipped version.

## Post-mortem

After every SEV-1 and SEV-2 incident:

- Write a blameless post-mortem in `docs/post-mortems/<date>-<slug>.md`.
- Capture: what happened, what worked, what didn't, action items,
  owners, due dates.
- Link from the next-release changelog.

## Roster (TBD)

Until a roster exists, the maintainer of record is the GitHub repo
owner. Update this section when a security team exists.
