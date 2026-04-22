# Web Variant Plan (2 Stages)

## Stage 1: MVP (Local, Safe)

Goal: Ship a working web page that can run existing button commands in run-only mode.

- Add `webServer` settings to preset/model:
  - `enabled: boolean`
  - `host: "127.0.0.1"` (fixed in MVP)
  - `port: number` (default, e.g. `3210`)
- Start an embedded HTTP server in Electron main process:
  - `GET /` -> serves web UI
  - `GET /api/state` -> returns run-only button state (without service button)
  - `POST /api/run/:buttonId` -> runs selected button chain
- Add `Web server` tab in settings UI:
  - enable/disable toggle
  - port input
  - status indicator (`running/stopped/error`)
  - `Open in browser` action
- Enforce web restrictions:
  - run mode only
  - no service button
  - no edit controls
- Handle basic errors:
  - busy port
  - invalid port
  - server disabled/not started

Expected result:

- Local browser can open the UI and run buttons via HTTP.

## Stage 2: Stability and UX Polish

Goal: Make the feature robust, predictable, and ready for everyday use.

- Auto-sync web UI when preset/buttons change.
- Improve Web tab UX:
  - visible URL
  - clearer status/errors
  - restart server action
- Strengthen safety:
  - strict API payload validation
  - basic rate limiting for run endpoint
  - optional access token support (if LAN mode is enabled later)
- Add test coverage:
  - unit tests for `webServer` config
  - integration tests for API endpoints
  - smoke test: server start + button run
- Add docs:
  - how to enable and use web mode
  - known limits (run-only, no service button)
  - troubleshooting for port conflicts

Expected result:

- Stable, test-covered web mode with clear behavior and operational guidance.
