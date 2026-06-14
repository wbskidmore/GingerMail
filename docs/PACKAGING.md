# Packaging & signing GingerMail

GingerMail packages as a DMG on macOS (arm64), an NSIS installer on Windows
(x64 + arm64), and an AppImage on Linux (x64). Auto-updates are wired through
`electron-updater`.

> **Signing status:** the release pipeline is **signing-enabled and
> secret-driven**. When the GitHub Actions secrets below are present, the
> `Release` workflow produces a signed + notarized macOS DMG, a signed Windows
> EXE, a GPG-signed Linux AppImage, and a cosign-signed Docker image. When a
> credential is absent, that channel falls back to an UNSIGNED artifact (plus
> checksums) instead of failing the build (compliance POA&M PM-008). Until a
> macOS cert is provisioned, macOS shows a Gatekeeper warning and Windows shows
> a SmartScreen prompt (OV certs warn until reputation accrues; EV / Azure
> Trusted Signing clears SmartScreen immediately).
>
> **No certificates yet?** Use the **`dev` channel** (see
> [Dev vs Prod builds](#dev-vs-prod-builds-channel-toggle)). It produces fully
> functional UNSIGNED installers and never fails for missing credentials, so you
> can build and distribute today and flip to signed `prod` builds the moment the
> identities exist.

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
the installers (`.dmg`, `.exe`, `.AppImage` + `*.sig` + `SHA256SUMS` +
`latest*.yml` + `.blockmap`) plus the Docker tarball to a **draft** GitHub
Release for you to review and publish. You can also run it from the Actions tab
via `workflow_dispatch` to get build artifacts without cutting a release.

## Dev vs Prod builds (channel toggle)

A single per-run toggle decides whether a build is signed. You don't need any
certificates for the `dev` channel.

| Trigger                                                                                | Channel | Result                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manual run** (Actions tab -> _Release_ -> _Run workflow_), `channel = dev` (default) | dev     | **Unsigned** installers for all three OSes. macOS notarization is forced off, keychain auto-discovery is disabled, so **no leg can fail for missing credentials**. Artifacts are downloadable from the run. Tick _publish_release_ to also cut a draft **pre-release** named `… (dev / unsigned)`. |
| **Manual run**, `channel = prod`                                                       | prod    | Signed + notarized **when the signing secrets exist**; gracefully falls back to unsigned otherwise.                                                                                                                                                                                                |
| **Push a tag** `vX.Y.Z`                                                                | prod    | Always the signed/notarized path, and always publishes a draft Release.                                                                                                                                                                                                                            |

How it works (no YAML edits needed to switch):

- The `mode` job resolves `channel`/`signed` once and every leg reads it.
- `dev` legs run `electron-builder … --config.mac.notarize=false` with
  `CSC_IDENTITY_AUTO_DISCOVERY=false`, overriding the `notarize: true` in
  `electron-builder.yml` only for that run.
- `prod` legs run the normal signing path and pick up the secrets below.

**Build an unsigned installer locally** (no certs, no notarization):

```bash
pnpm dist:mac:dev     # macOS DMG, unsigned (notarize off)
pnpm dist:win:dev     # Windows NSIS, unsigned
pnpm dist:linux:dev   # Linux AppImage, unsigned
```

These mirror the CI `dev` channel and are guaranteed not to hunt for a keychain
identity. Use the `dist:*` / `dist:*:no-ollama` scripts once you have certs.

### Required GitHub Actions secrets

Add these under **repo Settings -> Secrets and variables -> Actions**. They only
matter on the **`prod` channel** (tag push or `channel = prod`). Each channel
signs only when its secrets exist; otherwise it produces an unsigned artifact
(+ checksums) without failing the build.

| Secret                        | Channel | Purpose                                                                                |
| ----------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `CSC_LINK`                    | macOS   | Base64 of the Developer ID Application `.p12`                                          |
| `CSC_KEY_PASSWORD`            | macOS   | Password for that `.p12`                                                               |
| `APPLE_ID`                    | macOS   | Apple ID email used for notarization                                                   |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS   | App-specific password (appleid.apple.com)                                              |
| `APPLE_TEAM_ID`               | macOS   | 10-char Apple Developer Team ID                                                        |
| `WIN_CSC_LINK`                | Windows | Base64 of the code-signing `.pfx`                                                      |
| `WIN_CSC_KEY_PASSWORD`        | Windows | Password for that `.pfx`                                                               |
| `GPG_PRIVATE_KEY`             | Linux   | ASCII-armored private key (signs the AppImage)                                         |
| `GPG_PASSPHRASE`              | Linux   | Passphrase for that GPG key                                                            |
| _none_                        | Docker  | cosign keyless uses the Actions OIDC token; `GITHUB_TOKEN` already pushes to `ghcr.io` |

Base64-encode a cert for the secret value with `base64 -i cert.p12 | pbcopy`
(macOS) or `base64 -w0 cert.pfx` (Linux). Export an armored GPG key with
`gpg --armor --export-secret-keys <KEYID>`.

### Obtaining the credentials

- **Apple:** enroll in the Apple Developer Program, create a _Developer ID
  Application_ certificate (Xcode -> Settings -> Accounts, or
  developer.apple.com), export it as a `.p12`, and generate an app-specific
  password at appleid.apple.com. Your Team ID is on the membership page.
- **Windows:** buy an OV or EV code-signing certificate (DigiCert, Sectigo,
  etc.) or set up **Azure Trusted Signing**, then export/obtain the `.pfx`. An
  OV cert signs but SmartScreen warns until reputation builds; EV / Azure
  Trusted Signing clears SmartScreen immediately. (To switch Windows to Azure
  Trusted Signing later, add an `azureSignOptions` block under `win:` in
  `electron-builder.yml`.)
- **Linux / Docker GPG:** `gpg --full-generate-key`, then export the private
  key (armored) for `GPG_PRIVATE_KEY`. Publish the matching public key so users
  can verify.

### Cutting a signed release

```bash
# 1. Bump the version in package.json, then:
git tag v1.0.4
git push origin v1.0.4
# 2. Watch the Actions run; it creates a DRAFT Release with all signed assets.
# 3. Verify the assets (commands below), then publish the draft.
```

### Verifying signatures

```bash
# macOS - signature + notarization stapling
codesign --verify --deep --strict --verbose=2 GingerMail.app
spctl --assess --type execute --verbose GingerMail.app

# Windows (PowerShell) - Authenticode
Get-AuthenticodeSignature .\GingerMail-*-win-*.exe | Format-List

# Linux - detached GPG signature + checksums
gpg --verify GingerMail-*.AppImage.sig GingerMail-*.AppImage
sha256sum -c SHA256SUMS

# Docker image (registry) - cosign keyless
cosign verify ghcr.io/<owner>/gingermail:<version> \
  --certificate-identity-regexp 'https://github.com/<owner>/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# Docker tarball (download) - cosign blob
cosign verify-blob gingermail-<version>-docker.tar.gz \
  --signature gingermail-<version>-docker.tar.gz.sig \
  --certificate gingermail-<version>-docker.tar.gz.pem \
  --certificate-identity-regexp 'https://github.com/<owner>/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

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

### Enabling the bundled Ollama (SHA pinning)

To ship local AI in the box (so users don't install Ollama themselves), the
per-platform binary must be pinned by SHA-256 first — `scripts/fetch-ollama.mjs`
refuses to write an unverified binary (compliance POA&M PM-009). One-time setup:

1. Pick the version. It's pinned as `OLLAMA_VERSION` in `scripts/fetch-ollama.mjs`.
2. Download the upstream checksums for that version:
   `https://github.com/ollama/ollama/releases/download/<version>/sha256sum.txt`.
3. Copy the real sums into `SHA_BY_TARGET` (replacing the `PLACEHOLDER_*`
   values), or pass them at build time via env without editing the file:
   `OLLAMA_SHA256_DARWIN_ARM64`, `OLLAMA_SHA256_DARWIN_X64`,
   `OLLAMA_SHA256_WIN32_X64`, `OLLAMA_SHA256_LINUX_X64`.
4. Verify the fetch: `pnpm fetch:ollama` (current platform) or
   `node scripts/fetch-ollama.mjs --all`. A mismatch deletes the file and exits
   non-zero — that's tampering protection, not a bug.
5. Build with the Ollama-bundling scripts (`pnpm dist:mac` etc., which run
   `prepackage`) instead of the `:no-ollama` / `:dev` variants.

Until that's done, keep using the `:no-ollama` builds — the app still does local
AI against a user-installed Ollama.

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
- Stage 2 (`lscr.io/linuxserver/baseimage-kasmvnc:debianbookworm`) installs
  Chromium/Electron runtime libraries and copies the app to `/opt/gingermail`,
  starting it via `docker/root/defaults/autostart`. Debian (glibc) is required:
  the Alpine/musl base was tested and the prebuilt Electron binary fails to
  relocate against musl (even with gcompat). The image install step uses
  `--no-install-recommends` and prunes docs/man/locales to stay lean.

Build and run locally:

```bash
docker build -t gingermail:dev .
docker run -d --name gingermail -p 3001:3001 --shm-size=1g \
  -v gingermail-data:/config gingermail:dev
# open https://localhost:3001
```

In CI, the `docker` job in `.github/workflows/release.yml`:

1. Builds and **pushes** the image to `ghcr.io/<owner>/gingermail:<version>`
   (and `:latest`).
2. **Signs the image by digest with cosign keyless** (Sigstore) using the
   Actions OIDC token - no signing key to manage; the signature is recorded in
   the public Rekor transparency log.
3. Exports the same image with `docker save | gzip` to
   `gingermail-<version>-docker.tar.gz`, generates `SHA256SUMS`, and
   **cosign-signs the tarball** (`*.tar.gz.sig` + `*.tar.gz.pem`) so the
   downloadable file is independently verifiable.
4. Attaches the tarball, checksum, and signature files to the GitHub Release.

Users can either pull the signed image (`docker pull ghcr.io/<owner>/gingermail:<version>`)
or download and load the tarball (`docker load < gingermail-<version>-docker.tar.gz`).
See the "Verifying signatures" section above for the `cosign verify` commands.

## Environment variables (build-time)

| Variable                        | Purpose                                                 |
| ------------------------------- | ------------------------------------------------------- |
| `GM_GOOGLE_CLIENT_ID`           | OAuth client for Gmail / Google Calendar / Google Tasks |
| `GM_GOOGLE_CLIENT_SECRET`       | OAuth secret (loopback redirect, "Desktop app" type)    |
| `GM_MICROSOFT_CLIENT_ID`        | Azure AD app registration client id                     |
| `GM_MICROSOFT_TENANT`           | Azure tenant (defaults to `common`)                     |
| `APPLE_ID`                      | Apple developer account email (notarization)            |
| `APPLE_APP_SPECIFIC_PASSWORD`   | App-specific password for notarization                  |
| `APPLE_TEAM_ID`                 | Apple developer team id                                 |
| `CSC_LINK` / `CSC_KEY_PASSWORD` | Windows code-signing cert (PKCS12)                      |

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

`electron-builder` auto-detects them. The repo ships real 1024x1024 assets
(`build/icon.png`, `build/icon.icns`, `build/icon.ico`); regenerate the `.icns`
/ `.ico` / iconset from a new `build/icon.png` with `pnpm build:icons` (requires
macOS for `sips`/`iconutil`).
