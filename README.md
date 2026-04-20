# QuickButton

Electron-based desktop utility for sending button-driven `UDP` / `TCP` / `OSC-UDP` commands.

## Development

- Install deps: `npm install`
- Start app: `npm start`
- Typecheck: `npm run typecheck`
- M3 smoke checks: `npm run smoke`

## Packaging

- Pack without installer: `npm run pack`
- Build macOS installer artifact: `npm run dist:mac`
- Build Windows installer artifact: `npm run dist:win`
- Publish macOS artifacts to GitHub Releases: `npm run dist:mac:publish`
- Publish Windows artifacts to GitHub Releases: `npm run dist:win:publish`

All build artifacts are written to `release/`.

## Auto-update feed

- Runtime release feed URL is configured by `QB_RELEASES_URL`.
- Default value: `https://github.com/olegnovokhatskyi/QuickButton/releases`.
- CI release workflow (`.github/workflows/release.yml`) publishes installers and update metadata (`latest.yml`, `latest-mac.yml`, blockmaps) through `electron-builder`.

## macOS signing and notarization (B2)

`electron-builder` notarization is enabled (`build.mac.notarize = true`).  
For release CI you must provide:

- Signing certificate:
  - `CSC_LINK` (Developer ID Application certificate, base64 or file URL)
  - `CSC_KEY_PASSWORD`
- Notarization credentials (one option):
  - Preferred: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - Fallback: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

Local notarized release check:

- `npm run dist:mac:publish` (with the same env vars exported locally).
- Full close-out checklist: `docs/RELEASE-B2-CHECKLIST.md`.
