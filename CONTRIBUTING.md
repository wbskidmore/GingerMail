# Contributing to GingerMail

Thanks for helping out! This guide gets you from a fresh clone to a running app
and a clean pull request, no matter your experience level. If anything here is
unclear, that's a bug in this document — please open an issue.

## 1. Prerequisites

- **Node 20** — the repo pins it in [`.nvmrc`](.nvmrc). With nvm: `nvm use`
  (or `nvm install`). Other version managers (fnm, volta, asdf) read `.nvmrc`
  too.
- **pnpm 9** — the package manager (declared in `packageManager`). Install with
  `corepack enable` (ships with Node) or `npm i -g pnpm@9`.
- **Platform build tools** (only needed to package installers, not for `pnpm dev`):
  native modules compile via node-gyp, so you need Xcode CLT on macOS, or
  Build Tools + Python on Windows.

## 2. First run

```bash
git clone <repo-url> && cd GingerMail2
nvm use                 # selects Node 20
pnpm install            # installs deps + git hooks (via the prepare script)
pnpm rebuild-native     # rebuild better-sqlite3 against Electron's Node ABI
pnpm dev                # launches the hot-reloading desktop window
```

`pnpm dev` runs the Vite renderer and the Electron main process together. The
window reloads on renderer changes; main-process changes need a restart.

Optional: copy [`.env.example`](.env.example) to `.env` and fill in OAuth client
IDs if you want to test Google/Microsoft/Slack sign-in. The app works without
them (use IMAP/SMTP, POP3, or an Apple app-specific password).

## 3. Project layout

This is a pnpm workspace. Each package builds independently and depends only on
what it declares.

| Path                 | Package                 | Responsibility                                                              |
| -------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `apps/main`          | `@gingermail/main`      | Electron main process: windows, IPC, OAuth, auto-update, security hardening |
| `apps/renderer`      | `@gingermail/renderer`  | React UI (Vite). Tabs are code-split and lazy-loaded                        |
| `packages/core`      | `@gingermail/core`      | Pure domain models, types, IPC channel constants (zero deps)                |
| `packages/providers` | `@gingermail/providers` | Gmail / Microsoft / Apple / IMAP / POP3 / Slack / Discord adapters          |
| `packages/ai`        | `@gingermail/ai`        | LLM abstraction (cloud + local Ollama sidecar)                              |
| `packages/storage`   | `@gingermail/storage`   | Encrypted local cache (SQLCipher via better-sqlite3)                        |
| `packages/ui-kit`    | `@gingermail/ui-kit`    | Shared Mantine-based React components + theme                               |

Dependency direction: `renderer → core, ui-kit`; `main → core, providers, ai, storage`.

## 4. Everyday commands

```bash
pnpm dev          # run the app (renderer + main)
pnpm build        # build packages → renderer → main (the dist build order)
pnpm typecheck    # tsc -b across all packages
pnpm lint         # eslint, zero warnings allowed
pnpm test         # unit tests (vitest) across all packages
pnpm test:e2e     # Playwright smoke test
pnpm format       # Prettier write across the repo
```

Run a single test file:
`pnpm --filter @gingermail/core test src/focus.test.ts`

## 5. Building installers

You can build a real installer locally for your own OS. You do **not** need code-signing certificates — use the unsigned **dev** builds:

```bash
pnpm dist:mac:dev     # macOS DMG (unsigned, notarization off)
pnpm dist:win:dev     # Windows NSIS (unsigned)
pnpm dist:linux:dev   # Linux AppImage (unsigned)
```

For signed/notarized **prod** builds and the cross-platform release pipeline,
see [`docs/PACKAGING.md`](docs/PACKAGING.md) (the _Dev vs Prod builds_ section
covers the per-run channel toggle in CI).

## 6. Code style & git hooks

- **Formatting** is handled by Prettier ([`.prettierrc`](.prettierrc)); editor
  defaults align via [`.editorconfig`](.editorconfig).
- A **pre-commit hook** (husky + lint-staged) auto-formats and lints only the
  files you staged — installed automatically by `pnpm install`. To run it by
  hand: `pnpm exec lint-staged`.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org):
  `type(scope): summary`, e.g. `fix(providers): handle empty IMAP folder list`.
  A `commit-msg` hook enforces this. Common types: `feat`, `fix`, `docs`,
  `chore`, `refactor`, `test`, `ci`, `perf`.

## 7. Before you open a PR

1. `pnpm lint && pnpm typecheck && pnpm test` all pass.
2. New behavior has a test (this repo treats security-relevant paths seriously).
3. The diff is focused — one logical change per PR.
4. If you touched anything security-related (IPC, OAuth, CSP, storage, AI
   egress), re-read [`docs/security-hardening.md`](docs/security-hardening.md)
   and call it out in the PR description.

## 8. Security

Please do **not** file public issues for vulnerabilities — see
[`SECURITY.md`](SECURITY.md) for private disclosure.
