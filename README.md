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
```

### Launch the desktop app

After `pnpm install` (and `pnpm rebuild-native`), launch GingerMail one of two ways:

**Development (hot reload):** starts the Vite renderer and the Electron main
process together and opens the desktop window with live reload on both.

```bash
pnpm dev
```

**Packaged build:** build a native installer for your current OS, then launch
the installed app. Output lands in `release/<version>/` (UNSIGNED until certs
are provisioned).

```bash
pnpm dist:mac:no-ollama     # DMG     (macOS host)  -> open the .dmg, drag to /Applications, launch
pnpm dist:win:no-ollama     # NSIS    (Windows host) -> run the .exe installer, launch from Start menu
pnpm dist:linux:no-ollama   # AppImage (Linux host)  -> chmod +x the .AppImage, then run it
```

> The `:no-ollama` variants skip the bundled-Ollama fetch and fall back to a
> user-installed Ollama. Drop `:no-ollama` (e.g. `pnpm dist:mac`) for a signed,
> Ollama-bundled build. See [`docs/PACKAGING.md`](docs/PACKAGING.md) for signing,
> cross-platform release builds, and the full matrix.

## Run via Docker (browser-accessible)

The native installers (`.dmg` / `.exe` / `.AppImage`) are the primary way to run
GingerMail. As a convenience, the project also ships a Docker image that runs the
Linux build on a minimal [KasmVNC](https://github.com/linuxserver/docker-baseimage-kasmvnc)
desktop, so you can reach the full app from a browser without installing anything
natively.

### Get the image

**Option A - download from a GitHub Release** (no build toolchain needed):

```bash
# Download gingermail-<version>-docker.tar.gz from the Release assets, then:
docker load < gingermail-<version>-docker.tar.gz
```

**Option B - build it yourself from the repo root:**

```bash
docker build -t gingermail:dev .
```

The build is multi-stage: it compiles the renderer + main + packages, runs
`electron-builder --linux dir`, and copies the unpacked app onto the KasmVNC
base image. See [`Dockerfile`](Dockerfile).

### Run it

```bash
docker run -d --name gingermail \
  -p 3001:3001 \
  --shm-size=1g \
  -v gingermail-data:/config \
  gingermail:<version>   # or gingermail:dev if you built locally
```

Then open **https://localhost:3001** (self-signed cert, so accept the browser
warning on first load).

| Flag                         | Why                                                                |
| ---------------------------- | ------------------------------------------------------------------ |
| `-p 3001:3001`               | KasmVNC web UI (HTTPS). Map to another host port if 3001 is taken. |
| `--shm-size=1g`              | Gives Chromium enough shared memory; the app may crash without it. |
| `-v gingermail-data:/config` | Persists accounts, cache, and settings across restarts.            |

### Manage the container

```bash
docker logs -f gingermail     # follow startup / app logs
docker stop gingermail        # stop
docker start gingermail       # start again (data persists in the volume)
docker rm -f gingermail       # remove the container (volume is kept)
```

To upgrade, `docker rm -f gingermail`, load/build the new image, and `docker run`
again with the same `-v gingermail-data:/config` volume.

> The container runs Electron with `--no-sandbox` because containers lack the
> user-namespace sandbox, so treat Docker as a convenience channel rather than
> the hardened native build. Full build details are in
> [`docs/PACKAGING.md`](docs/PACKAGING.md).

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
