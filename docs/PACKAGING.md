# Packaging & signing GingerMail

GingerMail packages as a DMG on macOS (arm64), an NSIS installer on Windows
(x64 + arm64), and an AppImage on Linux (x64). Auto-updates are wired through
`electron-updater`.

> **Signing status:** builds are currently **UNSIGNED**. Code signing +
> notarization is env-driven and activates once certificates are provisioned
> (see `docs/compliance/poam.md` PM-008). Until then, macOS shows a Gatekeeper
> warning on first launch and Windows shows a SmartScreen prompt.

## Cross-platform release builds (recommended)

You cannot reliably build all three platforms from one machine (Windows NSIS
needs Wine; Linux AppImage needs a Linux toolchain). Use the native build
matrix in `.github/workflows/release.yml` instead:

```bash
# Bump the version in package.json first, then:
git tag v1.0.1
git push origin v1.0.1
```

The workflow builds macOS, Windows, and Linux on their own runners and attaches
the installers (`.dmg`, `.exe`, `.AppImage` + `latest*.yml` + `.blockmap`) to a
**draft** GitHub Release for you to review and publish. You can also run it from
the Actions tab via `workflow_dispatch` to get build artifacts without cutting a
release.

## Local single-platform builds

electron-builder only builds the host OS reliably. From the matching OS:

```bash
pnpm dist:mac:no-ollama     # DMG (macOS host)
pnpm dist:win:no-ollama     # NSIS (Windows host)
pnpm dist:linux:no-ollama   # AppImage (Linux host)
```

The `:no-ollama` variants skip the bundled-Ollama fetch (no verified binary
SHAs are pinned yet — see `scripts/fetch-ollama.mjs` and POA&M PM-009); the app
falls back to a user-installed Ollama on `:11434`. Output lands in
`release/<version>/`.

## Docker distribution (browser-accessible)

GingerMail also ships a Docker image that runs the Linux build on a minimal
KasmVNC desktop, reachable from a browser at `https://<host>:3001`. This is a
**convenience channel**, not the hardened native build: containers lack the
user-namespace sandbox, so Electron runs with `--no-sandbox`.

How it is built:

- The root [`Dockerfile`](../Dockerfile) is multi-stage. Stage 1 (`node:20-bookworm`)
  runs `pnpm install` + `pnpm build` + `electron-builder --linux dir` to emit an
  unpacked tree (`release/<version>/linux-unpacked`). The `dir` target is added
  in `electron-builder.yml` precisely so the container can copy the unpacked app
  without AppImage FUSE issues.
- Stage 2 (`lscr.io/linuxserver/baseimage-kasmvnc`) installs Chromium/Electron
  runtime libraries, copies the app to `/opt/gingermail`, and starts it via
  `docker/root/defaults/autostart`.

Build and run locally:

```bash
docker build -t gingermail:dev .
docker run -d --name gingermail -p 3001:3001 --shm-size=1g \
  -v gingermail-data:/config gingermail:dev
# open https://localhost:3001
```

In CI, the `docker` job in `.github/workflows/release.yml` builds the image,
exports it with `docker save | gzip` to `gingermail-<version>-docker.tar.gz`,
generates `SHA256SUMS`, and attaches both to the GitHub Release. Users install
it with `docker load < gingermail-<version>-docker.tar.gz`. No registry push is
configured; add a `docker/login-action` + push step targeting `ghcr.io` if you
later want it in GitHub Packages too.

## Environment variables (build-time)

| Variable | Purpose |
| --- | --- |
| `GM_GOOGLE_CLIENT_ID` | OAuth client for Gmail / Google Calendar / Google Tasks |
| `GM_GOOGLE_CLIENT_SECRET` | OAuth secret (loopback redirect, "Desktop app" type) |
| `GM_MICROSOFT_CLIENT_ID` | Azure AD app registration client id |
| `GM_MICROSOFT_TENANT` | Azure tenant (defaults to `common`) |
| `APPLE_ID` | Apple developer account email (notarization) |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple developer team id |
| `CSC_LINK` / `CSC_KEY_PASSWORD` | Windows code-signing cert (PKCS12) |

## OAuth app registrations

### Google
1. Create a project in <https://console.cloud.google.com/>.
2. Enable: Gmail API, Google Calendar API, Tasks API.
3. OAuth consent screen -> External, add the requested scopes (`gmail.modify`, `gmail.send`, `calendar`, `tasks`, `userinfo.email`, `userinfo.profile`).
4. Credentials -> Create OAuth client -> **Desktop app**. Copy the client ID and secret into the env vars above.

### Microsoft
1. Register an app in <https://portal.azure.com/> -> Azure Active Directory -> App registrations.
2. Supported account types: "Personal Microsoft accounts only" (consumer) or multi-tenant.
3. Redirect URI: type `Public client/native (mobile & desktop)`, value `http://localhost`.
4. API permissions (delegated): `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Tasks.ReadWrite`, `User.Read`, `offline_access`.
5. Copy the application (client) ID into `GM_MICROSOFT_CLIENT_ID`.

## Signing macOS

`electron-builder.yml` already enables hardened runtime + entitlements. To sign and notarize:

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=...
export APPLE_TEAM_ID=ABCDE12345
pnpm dist:mac
```

`electron-builder` will pick the signing identity from the keychain (`Developer ID Application: ...`).

## Signing Windows

```bash
export CSC_LINK=/path/to/cert.pfx
export CSC_KEY_PASSWORD=...
pnpm dist:win
```

## Auto-update feed

Add a `publish` block to `electron-builder.yml` with your update host of choice, e.g. GitHub releases:

```yaml
publish:
  provider: github
  owner: your-org
  repo: gingermail
```

Then push tagged releases and `electron-updater` (already initialised in `apps/main/src/autoUpdater.ts`) will check on launch and download new versions silently.

## App icon

Drop the source icons into `build/`:

- `icon.icns` (1024x1024, macOS)
- `icon.ico` (multi-resolution, Windows)
- `icon.png` (1024x1024, Linux + DMG background fallback)

`electron-builder` auto-detects them. The repo currently ships placeholder text files - replace them with the real assets before the first signed build.
