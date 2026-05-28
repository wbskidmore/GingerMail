# GingerMail v1.0 security hardening summary

This document captures the production-readiness work landed for v1.0,
addressing the cybersecurity architect review's top 10 (item #2 — code
signing + notarization — is deferred to the cert procurement workstream).

## #1 — At-rest DB encryption (SQLCipher)

**Status:** shipped.

- New dep: `better-sqlite3-multiple-ciphers` (SQLCipher-compatible).
- `packages/storage/src/openEncryptedDb.ts` wraps driver selection,
  key validation, and in-place plaintext → encrypted migration.
- `apps/main/src/context.ts` derives the DB key on first launch via
  `generateEncryptionKeyHex()` and stores it in `TokenVault`
  (`'dbEncryptionKey'`), which itself lives in the OS keychain.
- Existing plaintext DBs are migrated on first open. A timestamped
  backup (`<path>.pre-encryption.<iso>.bak`) is left behind so a botched
  migration can be rolled back.
- Override: `GM_ALLOW_UNENCRYPTED_DB=1` skips encryption (dev only).

## #3 — Auto-updater with signed manifests + opt-in + kill-switch

**Status:** shipped, endpoint TBD.

- `electron-builder.yml` now ships a `publish:` block pointing at
  `updates.gingermail.app/${channel}/${os}/${arch}`.
- `apps/main/src/autoUpdater.ts`:
  - `autoDownload = false` (opt-in click).
  - `autoInstallOnAppQuit = true` (after user click).
  - `allowDowngrade = false`, `allowPrerelease = false`.
  - Manifest version `0.0.0-killswitch` short-circuits the install.
- IPC: `updates:status`, `updates:check`, `updates:download`.
- Settings: `updates: { optIn: false, channel: 'latest' }` (off by
  default).

## #4 — OAuth: PKCE + state + scope minimization

**Status:** shipped.

- `apps/main/src/oauth/loopback.ts`:
  - Enforces path = `/callback`, rejects everything else (404).
  - Validates `state` against the per-attempt nonce.
  - Success page scrubs `?code=…&state=…` from the browser URL bar via
    `history.replaceState`.
- `apps/main/src/oauth/google.ts` now uses PKCE S256.
- `apps/main/src/oauth/microsoft.ts` (already had PKCE) now also passes
  `expectedState` to the loopback.
- `GOOGLE_SCOPES` / `MICROSOFT_SCOPES` are documented with per-scope
  rationale to prevent future drift.

## #5 — AI egress allowlist + PII redaction

**Status:** shipped.

- `packages/core/src/models.ts` adds `AI_VENDOR_HOSTS` (per-vendor host
  list) and `AiSettings.privacy.redactPii`.
- `apps/main/src/security/aiEgress.ts` provides:
  - `allowedAiHosts()`, `isUrlAllowedForAi()` (pure, unit-tested).
  - `installAiEgressFilter()` for the renderer session.
- `packages/ai/src/client.ts`:
  - Pre-flight `assertCloudUrlAllowed()` on every cloud call.
  - Optional PII redaction via `redactPii()` from `@gingermail/core`.
  - `provenance` getter on every client → renderer per-message badge.

## #6 — Secret-aware logging

**Status:** shipped.

- `apps/main/src/log/scrub.ts` provides:
  - `scrubSecrets()` (Bearer, Basic, x-api-key, JWT, OpenAI/Slack/Google
    prefixed tokens, long hex, JSON access_token/password/cookie etc.).
  - `wrapLoggerWithScrub()` for the electron-log logger.
  - `installConsoleScrubbing()` — global console.* patch installed at
    boot so even libraries that bypass our logger get scrubbed.

## #7 — Mail HTML iframe lockdown

**Status:** already shipped; regression test added.

- `MessageBodyFrame` in `apps/renderer/src/tabs/MailTab.tsx`:
  - `sandbox=""` (no `allow-*` tokens).
  - `srcDoc` only (no `src=`).
  - `referrerPolicy="no-referrer"`.
  - Meta CSP `default-src 'none'` inside the srcdoc.
- New lint-style test: `apps/renderer/src/mail/messageBodyFrame.lint.test.ts`.

## #8 — IPC channel hardening

**Status:** shipped (sender guard universal; zod schemas on high-impact
write channels).

- `apps/main/src/ipc/guards.ts`:
  - `bindMainWindowForIpc(id)` — sender guard rejects any non-main-window
    invocation.
  - `safeHandle(channel, schema, fn)` — zod validation + sender guard +
    structured `{ok:false,error:{code,message}}` envelopes on failure.
  - Shape-only audit log on validation failure (NEVER values).
- `apps/main/src/ipc/schemas.ts` — zod schemas per channel.
- Migrated: settingsUpdate, accountsAdd/Remove/Test/BeginOAuth,
  aiSetCloudKey, aiPullModel, aiDeleteModel, unsubPerform/Mute/Unmute/Dismiss.
- All remaining channels still get the universal sender guard via the
  wrapped `handle()` helper.

## #9 — Supply chain

**Status:** shipped.

- `package.json` scripts: `sbom`, `sbom:xml`, `audit:prod`.
- `.github/dependabot.yml` — daily npm scans, grouped by ecosystem.
- `.github/workflows/ci.yml` — `pnpm audit --prod --audit-level high`
  hard-fails CI; CodeQL on every push; SBOM artifact on main.

## #10 — Disclosure surface

**Status:** shipped.

- `SECURITY.md` — disclosure policy + scope + hardening map.
- `PRIVACY.md` — what stays local, what leaves, when, and to whom.
- `docs/incident-response.md` — severity ladder, kill-switch, post-mortem
  process.
- `public/.well-known/security.txt` — RFC 9116 entry point.

## Deferred / next

- **#2 code signing + notarization.** Requires Apple Developer ID +
  Windows Authenticode certs. Procurement is a separate workstream.
- Refresh-token rotation hooks (Google/Microsoft providers): currently
  the providers refresh tokens implicitly; an explicit rotation event
  + `TokenVault` update is a follow-up.
- Per-account "Sensitive" UI toggle. The data model carries
  `sensitiveAccountIds` but the Settings card does not yet expose it.
- Settings → Updates UI card. The IPC channels are wired but the React
  page is a follow-up PR.
- Settings → AI → Privacy → PII-redaction toggle UI. Same — data model
  is ready, UI is a follow-up.
