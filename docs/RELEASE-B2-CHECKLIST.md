# QuickButton B2 Checklist (macOS Signing + Notarization)

Use this checklist to fully close Plan-3 **B2**.

## 1) Prepare signing assets

- Ensure Apple Developer account has **Developer ID Application** certificate.
- Export certificate as `.p12` with password.
- Convert `.p12` to base64 and store securely:
  - `base64 -i DeveloperID.p12 | pbcopy`

## 2) Configure GitHub Secrets

Required for macOS release workflow:

- `CSC_LINK` — base64 of Developer ID `.p12` or supported URL form.
- `CSC_KEY_PASSWORD` — password used when exporting `.p12`.

Notarization (choose one credential set):

- **Preferred (API key):**
  - `APPLE_API_KEY`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
- **Fallback (Apple ID):**
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`

Optional but recommended:

- Verify `GITHUB_TOKEN` has `contents: write` (already set in workflow permissions).

## 3) Trigger release workflow

- Create and push tag:
  - `git tag v0.1.5`
  - `git push origin v0.1.5`
- Or run workflow manually via `workflow_dispatch`.

Expected CI outputs in GitHub Release:

- mac artifacts (`.dmg`, `.zip`)
- updater metadata (`latest-mac.yml`, blockmaps)
- if Windows job runs: `latest.yml` + NSIS artifacts

## 4) Verify notarization + staple in CI logs

In macOS job logs, confirm:

- code signing step completed
- notarization submitted and accepted
- stapling step finished without error

If notarization is skipped, fail B2 and fix secrets.

## 5) Verify packaged app on clean macOS machine

After download:

- Gatekeeper check:
  - `spctl --assess --type execute -vv "/Applications/QuickButton.app"`
- Signature check:
  - `codesign --verify --deep --strict --verbose=2 "/Applications/QuickButton.app"`
- Notarization ticket check:
  - `xcrun stapler validate "/Applications/QuickButton.app"`

All commands must pass without errors.

## 6) Smoke runtime update check

On installed packaged app:

- open `Help -> Check for updates...`
- confirm status is correct (available / none / network error)

## 7) Definition of done for B2

B2 is complete only when all are true:

- release workflow succeeds with real secrets
- mac artifact is signed, notarized, and stapled
- clean-machine verification commands pass
- update-check UI path works on packaged build
