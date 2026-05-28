# Packaging & signing GingerMail

GingerMail ships as a signed DMG on macOS and a signed NSIS installer on Windows. Auto-updates are wired through `electron-updater`.

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
