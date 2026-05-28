# GingerMail roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| P0 | pnpm workspace, Electron+Vite+React+TS shell, four-tab IPC layout | shipped |
| P1 | Generic IMAP/SMTP mail (ImapFlow + nodemailer), three-pane Apple-Mail UI, SQLite cache | shipped |
| P2 | Gmail + Microsoft OAuth providers, Apple app-specific password path, unified inbox | shipped |
| P3 | Calendar tab with Day/Week/Month views; Google Calendar + Graph + CalDAV adapters; ICS import/export | shipped |
| P4 | Tasks tab with Google Tasks + Microsoft To Do + local tasks; drag-to-calendar time-blocking | shipped |
| P5 | Persistent scheduler + native notifications with snooze/action callbacks | shipped |
| P6 | Focus Mode, universal snooze, low-stim defaults, dyslexic font option | shipped |
| P7 | AI client abstraction; settings for cloud (BYO key) + local Ollama | shipped |
| P8 | Vibrancy/Mica theming, accent-color following, code-signing, electron-updater, crash reporting | shipped |

## Open follow-ups

- Register Google and Azure OAuth apps and wire client IDs into `apps/main/src/config.ts`
- Sign + notarize macOS DMG (set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`)
- Code-sign Windows installer (set `CSC_LINK`, `CSC_KEY_PASSWORD`)
- Configure update feed in `electron-builder.yml` `publish` block
