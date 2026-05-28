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
pnpm dist                 # build signed installers for current OS
```

## ADHD-first defaults

- Low-stimulation palette and generous spacing by default
- Universal snooze on every email / event / task
- Focus Mode (Cmd/Ctrl+Shift+F) - dims everything but the active item, suppresses notifications, optional Pomodoro break nudge
- Optional dyslexic-friendly font, adjustable density and font size
- Notifications batched into a single digest by default (not per email)

## Status

Phased build - see `docs/ROADMAP.md` for what's shipped and what's next.
