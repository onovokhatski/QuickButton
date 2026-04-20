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
- for `udp/tcp` set payload (`string` or `hex`);
- for `osc-udp` set OSC address and argument(s).

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
  - background image/icon with darken amount
  - label visibility (`always`, `hover`, `never`)

### Command Chains

- A button can contain multiple commands.
- Command order is editable (drag and reorder).
- Per-command test send.
- Validation before execution.

### Connections (Endpoint Profiles)

- Reusable connection profiles (`host`, `port`, `protocol`).
- Commands reference connections by ID.
- Easy profile updates without editing every command manually.

### Modes

- `Edit` mode: configure layout, buttons, and commands.
- `Use` mode: run actions quickly with minimal UI noise.

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
- `F1` or `?` - Open shortcuts overlay

---

## Development Commands

- Install dependencies: `npm install`
- Start app: `npm start`
- Unit/integration tests: `npm test`
- E2E tests: `npm run test:e2e`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
