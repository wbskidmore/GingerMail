# GingerMail privacy policy

**Last updated: 2026-05-29**

GingerMail is a desktop email + calendar + tasks application. It runs
entirely on your own machine and connects directly to your mail
providers. It does not run a backend service that holds your data.

This document describes what data the app touches, where it goes, and
what we do (and don't do) with it.

## What stays local

Everything mail-shaped stays on your machine:

- Mail headers, bodies, attachments — cached in an encrypted SQLite
  database under your OS user-data directory (`~/Library/Application
Support/GingerMail/gingermail.sqlite` on macOS,
  `%APPDATA%/GingerMail/gingermail.sqlite` on Windows).
- The DB is encrypted at rest with SQLCipher. The encryption key is
  generated once on first launch and stored in your OS keychain
  (macOS Keychain, Windows DPAPI via Electron `safeStorage`).
- Account passwords, OAuth tokens, and AI API keys are stored in the
  same OS keychain.

## What goes off your machine, and where

| When                                | What is sent                                                                                                    | To whom                                                | How to disable                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Always (mail sync)                  | Your mail credentials, IMAP/SMTP/Graph/Gmail API calls                                                          | The mail provider you configured                       | Remove the account in Settings → Accounts                              |
| Slack connected (opt-in)            | Your Slack token + Web API calls (read conversations/messages, send messages, mark read)                        | `slack.com`                                            | Disconnect in Settings → Chat, or turn off "Enable chat"               |
| Discord connected (opt-in)          | Your Discord bot token + REST/Gateway calls (read & send messages in invited servers, real-time message events) | `discord.com`                                          | Disconnect in Settings → Chat, or turn off "Enable chat"               |
| Cloud AI on (opt-in)                | The text of the email, chat message, or thread you asked AI to act on, plus your prompt                         | The AI vendor you chose (OpenAI, Anthropic, or Google) | Settings → AI → Mode: Off (or Local)                                   |
| Detection agents on (opt-in)        | Incoming chat/mail message text scanned for actionable items, sent to the configured AI client                  | Your AI vendor (cloud) or nobody (local Ollama)        | Settings → AI → Detection agents → Enable, plus the per-source toggles |
| Local AI on                         | (none) — the Ollama sidecar runs on your machine; no traffic leaves                                             | Loopback only                                          | n/a                                                                    |
| Auto-update opt-in (off by default) | App version + OS + arch on update check                                                                         | `updates.gingermail.app` (run by us)                   | Settings → Updates → Auto-update toggle                                |
| One-click unsubscribe               | An RFC 8058 HTTPS POST to the sender's unsubscribe URL                                                          | The sender / their email service provider              | Don't click "Unsubscribe"                                              |

## Things we explicitly do NOT do

- We do not run a backend. No mirror of your mail exists on our servers,
  because we have no servers (except the static update host).
- We do not have analytics, telemetry, or crash reporting beacons. The
  desktop app does not contact our domain on launch.
- We do not sell, share, or aggregate user data. We don't have it.
- We do not log into your mail provider on your behalf. OAuth tokens
  belong to the vendor; we just store them so the app can use them.

## Privacy posture for cloud AI

When you enable cloud AI mode, the following protections apply:

1. **Egress allowlist.** The main process only allows outbound HTTP to
   the configured vendor's host. Any other URL (e.g. a typo in the
   "OpenAI-compatible base URL" field that points at a third-party host)
   is blocked at the network layer.
2. **PII redaction toggle.** Settings → AI → Privacy → "Redact PII before
   send" rewrites card numbers, SSNs, US phone numbers, IBAN, OTP codes,
   and email addresses to placeholders before the request body leaves
   your machine. Off by default; opt-in.
3. **Per-message AI badge.** Every AI-generated summary / reply draft
   carries a provenance string (e.g. `cloud:openai:gpt-4o-mini`) so you
   always see where your data went.
4. **Sensitive-account block.** You can tag accounts as Sensitive in
   Settings → Accounts; AI calls for those accounts are blocked even in
   cloud mode.

## Privacy posture for local (Ollama) AI

- Bundled or self-installed Ollama listens on `127.0.0.1` only.
- No network traffic leaves the machine.
- The model file lives in `~/.ollama/models`.

## Privacy posture for detection agents

Detection agents scan incoming chat (Slack/Discord) and/or mail messages for
actionable items. They are **off by default** and inherit the AI privacy
posture above:

- With **Local (Ollama)** AI selected, scanning happens entirely on-device —
  nothing about your messages leaves the machine.
- With **Cloud** AI selected, the scanned message text is sent to your chosen
  vendor under the same egress allowlist, optional PII redaction, and
  sensitive-account block described above.
- Scanning is scoped: only **newly-arrived** messages are scanned (never a bulk
  re-scan of your whole history), and only for the sources you enable (chat
  and/or mail).
- The `email` category **never sends mail automatically** — auto-add only ever
  saves a draft for you to review and send manually.
- Detected items are stored locally in the encrypted SQLite DB (`suggestions`
  table) so the review panel survives restarts; they are never uploaded.

## Children

GingerMail is not designed for users under 13. Don't use it if you are.

## Changes to this policy

We update this document in-tree. Material changes go in the changelog
and the in-app About card. Continued use after a policy change
constitutes acceptance.

## Contact

privacy@gingermail.app (or open a non-security GitHub issue tagged
`privacy`).
