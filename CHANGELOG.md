# Changelog

All notable changes to QuickButton are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning policy for 0.x:

- `0.x.y` (patch) — bug fixes, internal improvements, security hardening, backward-compatible schema bumps (legacy presets still open automatically).
- `0.x.0` (minor) — noticeable features or user-visible behavior changes.
- `1.0.0` — first public release after Sprint 3–4 stabilization.

## [Unreleased]

### Added

- **Plan-3 / A1 (completed):** centralized preset mutation API `applyAppCommand` in `src/renderer/modules/appCommands.ts` with `dispatch` wiring from `composer` into `events`, `grid`, `editor`, `connections`, `preset`, `service`, `shortcuts`, and `startup` (`contacts.*`, `preset.replace`, `preset.set*`, `preset.toggleMode`, `service.setShowInGrid`, legacy contact migration); optional `dispatch(cmd, { render: false, skipMarkDirty: true })` for live inputs and load paths; expanded unit coverage in `tests/appCommands.test.ts`.
- **Plan-3 / A2 (completed):** replaced full-snapshot undo with operation history in `src/renderer/modules/history.ts` (forward/backward command stacks + `uiBefore/uiAfter` snapshots), `dispatch` now records inverse deltas from `deriveCommandHistoryDelta`, and grouped input/slider edits into single undo steps via `historyGroup`; added regression tests in `tests/historyController.test.ts` and delta coverage in `tests/appCommands.test.ts`.
- **Plan-3 / B1 (completed):** configured `electron-builder` publish target for GitHub Releases, added publish scripts (`dist:mac:publish`, `dist:win:publish`), and added `.github/workflows/release.yml` to generate/publish update metadata (`latest.yml` / `latest-mac.yml` + blockmaps) as part of release CI; documented `QB_RELEASES_URL` default in README.
- **Plan-3 / B2 (started):** enabled `build.mac.notarize = true`, wired CI checks for mac signing/notarization secrets (`CSC_*` plus either `APPLE_API_*` or `APPLE_ID` credential set), and documented required env vars + local notarized publish command in README.
- **Plan-3 / B2 (started):** added `docs/RELEASE-B2-CHECKLIST.md` with end-to-end release verification steps (GitHub secrets, tag trigger, notarization/staple checks, and clean-machine validation commands).
- **Plan-3 / C1 (completed):** expanded Playwright E2E coverage in `tests/e2e/app.e2e.spec.js` with undo/redo after color+drag, multi-select bulk color with save/reload, and dirty-close confirm smoke; suite now covers 6 critical user journeys.
- **Plan-3 / C2 (completed):** expanded IPC contract tests in `tests/ipc.test.js` with explicit channel↔schema table assertions and invalid payload rejection cases for every schema-bound channel.
- **Plan-3 / C3 (completed):** added property/fuzz coverage for `sanitizePreset` in `tests/presetSchema.fuzz.test.js` with 500 deterministic random inputs, output-shape invariants, and explicit `PresetVersionError` assertion for future schema versions.
- **Plan-3 / D1 (completed):** removed renderer `innerHTML` usage in `src/renderer/modules/editor.ts`, `connections.ts`, `grid.ts`, and `service.ts` by switching to explicit DOM construction (`createElement`, `textContent`, `replaceChildren`) for command/contact/service UI rendering.
- **Plan-3 / D2 (completed):** added abuse-protection limits with explicit errors: preset file/content size checks in `electron/main.cjs` (2 MiB), command payload size ceiling (64 KiB) in main and renderer validation, and stricter IPC schema constraints (`runtimeExecuteChain.chain` array bound + max-length checks for `buttonId`/`currentPath`) with extra coverage in `tests/ipc.test.js`.
- **Plan-3 / E1 (completed):** upgraded right-panel tabs to accessible `tablist`/`tabpanel` semantics in `src/renderer/index.html` and synchronized keyboard navigation (`ArrowLeft`, `ArrowRight`, `Home`, `End`) plus ARIA state updates in `events.ts`/`render.ts`.
- **Plan-3 / E2 (completed):** expanded first-run onboarding with a live checklist (`contact → add button → test send`) and persisted progress tracking via `src/renderer/modules/onboarding.ts`, wired to real user actions across `events.ts`, `grid.ts`, `connections.ts`, `editor.ts`, and `runner.ts`.
- **Plan-3 / D3 (completed):** added session correlation (`sessionId`) across main/renderer diagnostics (`electron/logger.cjs`, `electron/main.cjs`, renderer diagnostics reporting), exposed `sessionId` via `app:getInfo`, and added one-click `Help → Export diagnostics bundle...` containing app/platform metadata, sanitized preset summary, and log tail for support triage.
- **Post-Plan-3 / P1-3+4 (completed):** hardened renderer typing in core flows by introducing `src/renderer/modules/domainTypes.ts` and narrowing `any` usage in `events.ts`, `render.ts`, and `runner.ts`; extended diagnostics v2 with runtime counters in main-process chain/test-send handlers and added `Help -> Copy support summary` for fast issue reporting.
- **Post-Plan-3 (planned):** added prioritized roadmap document `docs/POST-PLAN-3-BACKLOG.md` with P0/P1/P2 tracks, acceptance criteria, and recommended sprint order (B2 final, B3 signing bootstrap, typing hardening, diagnostics v2, onboarding polish, performance budget, import/export, protocol quality).
- **B10 (Sprint 4):** OSC encode/decode moved to `src/shared/oscCodec.cjs` with Vitest coverage (padding, int/float/string/bool, address validation, round-trip, known hex fixtures). `electron/main.cjs` imports `encodeOscPacket` from shared.
- **B8/B9 (Sprint 4, phase 1):** Vite renderer pipeline added (`vite.config.ts`, `build:renderer`, `dev` watch mode) with TypeScript entrypoint `src/renderer/main.ts`, modular bootstrap (`modules/bootstrap.ts`), typed IPC client (`ipc/client.ts`), and typed renderer state/store primitives (`state/ui-state.ts`, `state/store.ts`).
- **B13 (Sprint 4):** Playwright E2E scaffold added (`playwright.config.ts`, `tests/e2e/app.e2e.spec.js`, `test:e2e` script) with three core Electron scenarios (chain send, hotkeys flow, legacy preset migration/save-load path).
- **B18 (Sprint 5):** added in-app update status flow in menu (`Help -> Check for updates...`) using `electron-updater` with explicit status dialogs and release-page fallback.

### Changed

- **B11 (Sprint 4):** renderer now maps transport error codes to user-friendly toasts (`ETIMEDOUT`, `ECONNREFUSED`, `EHOSTUNREACH`/`ENETUNREACH`/`ENOTFOUND`, `EINVAL`) instead of showing only raw messages.
- **B17 (Sprint 4):** top bar now shows an app version pill (`vX.Y.Z`, plus git hash in dev), and close buttons show a red dirty-dot when preset has unsaved changes.
- **B8 (Sprint 4, phase 1):** Electron now loads renderer from `dist/renderer/index.html`; `prestart`/`prepack`/`predist:*` build both preload and renderer. Renderer HTML now boots via `main.ts` instead of directly loading `app.js`.
- **B9 (Sprint 4, phase 2):** renderer selection/tab/contact UI state now lives in `state.ui` (`selectedButtonId`, `selectedTarget`, `selectedContactId`, `activeRightTab`) and is consumed directly from there in `app.js`, removing duplicated local UI state variables.
- **B8/B9 (Sprint 4, phase 2):** shortcuts and onboarding flows are extracted from `app.js` into `src/renderer/modules/shortcuts.ts` and `src/renderer/modules/onboarding.ts`, wired through bootstrap/dependency injection.
- **B8/B9 (Sprint 4, phase 2):** connections domain extracted into `src/renderer/modules/connections.ts` (contacts normalization, legacy contact migration, form CRUD, panel rendering, and command target resolution), with `app.js` using controller-style wrappers.
- **B8/B9 (Sprint 4, phase 2):** service domain extracted into `src/renderer/modules/service.ts` (service cell/top-bar markup, service slot normalization, cell occupancy swap logic, and service action handling: minimize/close/toggle-mode).
- **B8/B9 (Sprint 4, phase 2):** grid domain extracted into `src/renderer/modules/grid.ts` (grid render, service/button drag-drop placement logic, plus-cell button creation, and selected-button interaction state).
- **B8/B9 (Sprint 4, phase 3):** command editor domain extracted into `src/renderer/modules/editor.ts` (command list rendering, command drag-drop reorder, collapse/delete actions, connection-aware fields, and inline test-send), with `app.js` delegating editor behavior to a controller.
- **B8/B9 (Sprint 4, phase 3):** preset workflow extracted into `src/renderer/modules/preset.ts` (open/save/save-as handlers and menu action routing for preset actions), with `app.js` delegating these actions through a controller.
- **B8/B9 (Sprint 4, phase 3):** event wiring extracted into `src/renderer/modules/events.ts` (menu actions, service/action delegates, control listeners, click-through pointer listeners, and shortcut/onboarding initialization), reducing `app.js` to orchestration and controller composition.
- **B8/B9 (Sprint 4, phase 3):** startup/bootstrap flow extracted into `src/renderer/modules/startup.ts` (load-last preset recovery, app info/version sync, initial selection hydration, bind/subscribe/resize boot sequence, and startup fallback handling), with `app.js` delegating `init()` to a startup controller.
- **B8/B9 (Sprint 4, phase 3):** interaction/click-through flow extracted into `src/renderer/modules/interaction.ts` (cursor polling, interactive-hit testing, pointer-driven click-through decisions, and debounced `setIgnoreMouseEvents` IPC), with `app.js` delegating runtime interaction policy to a controller.
- **B8/B9 (Sprint 4, phase 4):** renderer view host extracted into `src/renderer/modules/render.ts` (controls↔preset synchronization, button preview/style projection, selection-driven editor panel visibility, and top-level render pass orchestration), with `app.js` delegating render shell behavior to a controller.
- **B8/B9 (Sprint 4, phase 4):** renderer diagnostics listeners extracted into `src/renderer/modules/diagnostics.ts` (`error`/`unhandledrejection` wiring and forwarding to IPC diagnostics channel), reducing `app.js` global side-effect footprint.
- **B8/B9 (Sprint 4, phase 4):** command execution/validation flow extracted into `src/renderer/modules/runner.ts` (network error mapping, command schema validation, grid pulse feedback, and button chain execution), with `app.js` delegating runtime send logic to a runner controller.
- **B8/B9 (Sprint 4, phase 4):** DOM reference collection extracted into `src/renderer/modules/domRefs.ts` and preset model defaults/id helper extracted into `src/renderer/modules/model.ts`, reducing renderer entrypoint setup noise.
- **B8/B9 (Sprint 4, phase 4):** window resize orchestration extracted into `src/renderer/modules/windowSizing.ts` (RAF-throttled content resize + `ResizeObserver` bootstrap), with `app.js` delegating shell sizing behavior to a dedicated controller.
- **B8/B9 (Sprint 4, phase 4):** renderer composition root extracted into `src/renderer/modules/composer.js`; `src/renderer/app.js` is now a thin entrypoint re-exporting `startLegacyApp`, completing the app.js decomposition goal.
- **B12 (Sprint 4):** network delivery upgraded with optional retry/backoff metadata (`retry.count`, `retry.jitterMs`) for UDP/OSC sends and TCP connection pooling with keep-alive (`target.persistent`, `target.keepAliveMs`) plus automatic reconnect on `ECONNRESET`.
- **B12 (Sprint 4):** retry utilities extracted to `src/shared/networkRetry.cjs` with dedicated tests (`tests/networkRetry.test.js`), and preset schema advanced to v5 to persist network target options.
- **B15 (Sprint 4):** onboarding/shortcuts overlays now use keyboard focus trapping and ESC close handling (`src/renderer/modules/focusTrap.ts`, updated `onboarding.ts` and `shortcuts.ts`) for better keyboard accessibility and safer modal behavior.
- **B19 (Sprint 5):** undo/redo history added for editor+grid changes (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`) with a bounded 50-step stack and automatic reset on clean/save state.
- **B20 (Sprint 5):** grid now supports shift-click multi-select, and button editor supports bulk updates (bg/text color, font size, radius) with mixed-value hints for multi-selection.

### Fixed

- **E2E (Playwright):** UDP/hotkey scenarios now close the welcome onboarding when it is shown (it blocked clicks on tabs) and blur the focused command `<select>` before the number-key shortcut so `1` is not ignored as an “editable target”.
- **B14 (Sprint 4):** `last-used-preset.json` now uses atomic temp write + `fsync` + `rename`, with backup fallback (`last-used-preset.prev.json`) on read corruption.
- **B17 (Sprint 4):** deleting a button now asks for explicit confirmation (includes button name and command count), preventing accidental loss.

## [0.1.2] — 2026-04-19

Hotfix for 0.1.1.

### Fixed

- Preload script failed to load in packaged builds (`module not found: ../src/shared/ipc.cjs`). Under `sandbox: true`, Electron's preload `require()` is limited to a small allowlist and cannot resolve relative paths into the source tree, so the IPC bridge was never installed. Without it the renderer crashed on `window.quickButtonApi` access, which manifested as "the preview grid does not expand" and "the delete-button does not work". Preload is now pre-bundled with esbuild into a self-contained `electron/preload.cjs` (source moved to `electron/preload.source.cjs`), and `npm run build:preload` is wired into `prestart` / `predist:mac` / `predist:win`.
- Removed `frame-ancestors` from the `<meta http-equiv>` CSP; browsers ignore it there and logged a warning. It is still enforced via the `onHeadersReceived` header.

## [0.1.1] — 2026-04-19

Sprint 3 from `docs/IMPROVEMENT-PLAN-V2.md`: release hardening.

### Added

- `qb-asset://` custom protocol backed by a content-addressed (SHA-1) asset registry in `userData/assets/`. User-picked button icons are copied into the registry and referenced by id instead of absolute file paths.
- `PresetVersionError` is thrown when opening a preset whose schema version is newer than the installed app, instead of silently dropping fields.
- Crash handlers in the main process (`uncaughtException`, `unhandledRejection`, `render-process-gone`, `child-process-gone`) with a user-facing "QuickButton error / Open logs" dialog.
- Renderer forwards `window.error` and `unhandledrejection` events to main via a new `diagnostics:reportError` IPC channel so they land in the rotating log file.
- Snapshot-based regression tests for preset migrations covering fixtures v0→v3, plus forward-version rejection tests.
- ESLint (flat config) + Prettier + GitHub Actions CI workflow running lint, format:check, typecheck, and tests.
- npm scripts: `lint`, `lint:fix`, `format`, `format:check`.

### Changed

- Preset schema bumped to **v4**. Existing v0–v3 presets still load; legacy `style.iconPath` entries are hydrated into the asset registry on open and replaced with `style.iconAssetId`.
- Content Security Policy enforced both via `<meta http-equiv>` in `index.html` and an `onHeadersReceived` interceptor in main. `img-src` allows only `'self' data: qb-asset:` (no more `file:`).
- `BrowserWindow.webPreferences` now explicitly sets `webSecurity: true` and `allowRunningInsecureContent: false`.
- Preload and main now share IPC channel and menu event constants from `src/shared/ipc.cjs` instead of maintaining local duplicates.
- `dialog:pickIconFile` returns `{ assetId }` and no longer leaks filesystem paths to the renderer.

### Fixed

- Missing shared modules in the packaged app on Windows (`src/shared/**` now included in `app.asar`).
- Windows x64 and arm64 installers no longer overwrite each other (`${arch}` added to `artifactName`).
- NSIS "invalid icon file size" build failure on Windows (`build/icon.ico` rebuilt from standard 16–256 px PNGs instead of a single 1024 px source).

### Security

- Content Security Policy removes support for arbitrary `file://` loads in the renderer.
- Asset IDs are validated against `^[a-f0-9]{40}$` before any filesystem lookup, preventing path-traversal through IPC payloads.

## [0.1.0] — 2026-04-18

First internal build with Mac and Windows installers.

### Added

- Editable grid of programmable buttons; UDP / TCP / OSC-UDP commands per button with optional command chains.
- Presets saved as JSON with versioned schema and autosave of the last opened file.
- Contacts (named host/port/protocol destinations) reusable across buttons.
- Service button with configurable radius; frameless always-on-top window; optional click-through background.
- Keyboard cheatsheet overlay (`?` / `F1`) and `Cmd/Ctrl+G` to toggle the service button in the grid.
- macOS DMG (arm64) and Windows NSIS installers (x64, arm64, universal).
