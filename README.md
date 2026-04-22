# QuickButton

QuickButton is a desktop app for running network commands from a button grid.

Instead of manually entering host/port/payload every time, you build a preset once and run actions in one click (or with shortcuts). It is designed for live control, repeatable test flows, and fast automation where reliability matters.

---

## Quick Start (2-3 minutes)

### 1) Install and run

```bash
npm install
npm start
```

### 2) Create your first connection

Open the `Connections` tab and fill:

- Name
- Protocol (`udp`, `tcp`, or `osc-udp`)
- Host
- Port

Then click `Save`.

### 3) Add a button

- Click `Add button` (or `+` in an empty cell).
- Select the new button in the grid.

### 4) Add and configure command(s)

In `Button editor`:

- choose the Connection for the command;
- for `udp` set payload (`string`, `hex`, or `json`);
- for `tcp` set payload (`string` or `hex`);
- for `osc-udp` set OSC address and argument(s);
- optionally add `Delay` steps between commands.

### 5) Test and run

- Click `Test send` in the command card.
- Switch to `Use` mode and run the button from the grid.

---

## What This App Is For

QuickButton helps when you repeatedly send the same network actions:

- control external tools/devices quickly;
- reduce human errors in host/port/payload input;
- chain multiple commands behind a single action button;
- save and reuse presets across sessions.

---

## Full Feature Overview

### Protocol Support

- `UDP`
- `TCP`
- `OSC-UDP`

### Grid and Buttons

- Add, remove, drag, and swap buttons.
- Multi-select (`Shift + click`) for bulk style edits.
- Per-button style controls:
  - background/text color
  - font size
  - corner radius
  - text wrap
  - text alignment (horizontal + vertical)
  - background image/icon
  - label visibility (`always`, `hover`, `never`)

### Command Chains

- A button can contain multiple commands.
- Delay steps are supported inside the chain.
- Command order is editable (drag and reorder).
- Commands can be enabled/disabled and collapsed.
- Per-command test send.
- Validation before execution.
- JSON payload type is available for UDP commands (validated before send).

### Connections (Endpoint Profiles)

- Reusable connection profiles (`host`, `port`, `protocol`).
- Commands reference connections by ID.
- Easy profile updates without editing every command manually.

### Modes

- `Edit` mode: configure layout, buttons, and commands.
- `Use` mode: run actions quickly with minimal UI noise.

### Web Mode / Remote Triggering

- Built-in HTTP server can mirror the current grid in a browser (`Web` tab).
- Configure port and enable/disable web mode from the app UI.
- Run configured button chains from phone/tablet/another machine in the same network.

### Undo/Redo and History

- Operational undo/redo with grouped edits.
- Works for important editing flows (layout/style/command changes).

### Saving and Loading

- Open, Save, Save As via menu and shortcuts.
- Presets are JSON-based.
- Schema migration/sanitization for older preset formats.

### Autosave

Autosave writes changes into the current preset file and triggers:

- every 30 seconds;
- on mode switch;
- on app close (via in-app close action).

If no file path exists yet (you never used `Save As`), autosave is skipped.

### Onboarding and UX Guidance

- First-run onboarding overlay.
- Built-in onboarding checklist:
  - create a connection;
  - add a button;
  - test send.
- Keyboard shortcut overlay (`F1` / `?`).
- Visible help button (`?`) in the top panel opens shortcuts overlay.

### Diagnostics and Support

From `Help` menu:

- `Open logs folder`
- `Show log file`
- `Export diagnostics bundle...` (full support JSON)
- `Copy support summary` (quick issue-ready summary)
- `Check for updates...` (packaged app flow)

### Safety and Stability

- IPC payload validation.
- Preset and payload size limits.
- Preset sanitization on load.
- Reduced XSS surface in renderer.

---

## How to Use It Effectively (Recommended Workflow)

1. Create all required Connections first.
2. Build your grid layout in `Edit` mode.
3. Configure command chains per button.
4. Use `Test send` while still in `Edit` mode.
5. Save preset (`Save As`) to enable full autosave flow.
6. Switch to `Use` mode for day-to-day operation.

---

## Keyboard Shortcuts

- `Cmd/Ctrl + O` - Open preset
- `Cmd/Ctrl + S` - Save preset
- `Cmd/Ctrl + Shift + S` - Save As
- `Cmd/Ctrl + E` - Toggle Edit/Use
- `Cmd/Ctrl + Z` - Undo
- `Cmd/Ctrl + Shift + Z` - Redo
- `Cmd/Ctrl + 1` - Edit mode
- `Cmd/Ctrl + 2` - Use mode
- `Cmd/Ctrl + G` - Toggle service cell visibility
- `1...9` (in Use mode) - Run buttons by grid order
- `Esc` - Return from Use to Edit
- `F1`, `?` (`Shift + /`), or `Cmd/Ctrl + /` - Open shortcuts overlay

---

## Development Commands

- Install dependencies: `npm install`
- Start app: `npm start`
- Build macOS release: `npm run dist:mac`
- Build Windows release: `npm run dist:win`
- Unit/integration tests: `npm test`
- E2E tests: `npm run test:e2e`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
