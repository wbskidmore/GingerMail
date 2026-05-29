# GingerMail

A cross-platform (macOS + Windows) desktop email client with an Apple Mail style UI, an Outlook style calendar tab, and a Google Tasks style tasks tab. Themed to match the OS, designed for ADHD-friendly use, with pluggable mail/calendar/task providers and optional cloud or local AI.

## Stack

- Electron + Vite + React + TypeScript (pnpm workspace)
- `better-sqlite3` for local message/event/task cache
- `electron-builder` for packaging (DMG on macOS, NSIS on Windows)
- Providers: Gmail (googleapis), Microsoft (Graph + MSAL), Apple (CalDAV + IMAP), generic IMAP/SMTP (ImapFlow + nodemailer), POP3 (node-poplib)
- AI: OpenAI/Anthropic-compatible cloud OR local Ollama (settings-driven)

## Layout

```
apps/
  main/        Electron main process (window, IPC, scheduler, secure storage, notifications)
  renderer/    React UI: Mail / Calendar / Tasks / Settings tabs
packages/
  core/        Domain models (Account, Folder, Message, Event, Task), focus + snooze logic
  providers/   Adapters: gmail, microsoft, apple-caldav, imap-smtp, pop3
  ai/          LLM client abstraction (cloud or local Ollama)
  ui-kit/      Themed React primitives, ADHD defaults
  storage/     SQLite + electron-store + safeStorage wrappers
```

## Getting started

```bash
pnpm install
pnpm rebuild-native       # native module rebuild against Electron's Node ABI
pnpm dev                  # renderer + electron, hot reload both
pnpm dist                 # build installers for current OS (UNSIGNED until certs are provisioned)
```

## Run via Docker (browser-accessible)

The native installers (`.dmg` / `.exe` / `.AppImage`) are the primary way to run
GingerMail. As a convenience, each GitHub Release also ships a Docker image that
runs the Linux build on a minimal KasmVNC desktop, so you can reach the full app
from a browser without installing anything natively.

```bash
# 1. Download gingermail-<version>-docker.tar.gz from the GitHub Release, then:
docker load < gingermail-<version>-docker.tar.gz

# 2. Run it (data persists in the named volume):
docker run -d --name gingermail \
  -p 3001:3001 \
  --shm-size=1g \
  -v gingermail-data:/config \
  gingermail:<version>

# 3. Open https://localhost:3001 (self-signed cert on first load).
```

`--shm-size=1g` gives Chromium enough shared memory; `/config` is the persistent
data/cache volume. The container runs Electron with `--no-sandbox` (containers
lack the user-namespace sandbox), so it is a convenience channel rather than the
hardened native build. See `docs/PACKAGING.md` for build details.

## ADHD-first defaults

- Low-stimulation palette and generous spacing by default
- Universal snooze on every email / event / task
- Focus Mode (Cmd/Ctrl+Shift+F) - dims everything but the active item, suppresses notifications, optional Pomodoro break nudge
- Optional dyslexic-friendly font, adjustable density and font size
- Notifications batched into a single digest by default (not per email)

## Status

Phased build - see `docs/ROADMAP.md` for what's shipped and what's next.

## Security & compliance

- Security policy: `SECURITY.md`; hardening summary: `docs/security-hardening.md`.
- NIST 800-53 / 800-171 / CSF 2.0 / FedRAMP-readiness program (scope, control
  crosswalk, threat model, SSP, POA&M): `docs/compliance/`.
