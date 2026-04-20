import { activateFocusTrap, type FocusTrapController } from "./focusTrap";
import type { AppCommand } from "./appCommands";
type ButtonLike = {
  position: { col: number; row: number };
};

type ShortcutState = {
  preset: {
    buttons: ButtonLike[];
    ui: { mode: "edit" | "use"; grid?: { cols?: number } };
  };
};

type SetupShortcutsDeps = {
  state: ShortcutState;
  canEdit: () => boolean;
  dispatch: (command: AppCommand) => void;
  undo: () => boolean;
  redo: () => boolean;
  setStatus: (message: string) => void;
  runButton: (button: unknown) => void;
};

export type ShortcutsController = {
  toggleOverlay: (force?: boolean) => void;
};

function sortedButtonsByPosition(state: ShortcutState): ButtonLike[] {
  const cols = state.preset?.ui?.grid?.cols ?? 4;
  return [...(state.preset?.buttons ?? [])].sort((a, b) => {
    const ra = a.position.row * cols + a.position.col;
    const rb = b.position.row * cols + b.position.col;
    return ra - rb;
  });
}

function shortcutsOverlayVisible(): boolean {
  const overlay = document.getElementById("shortcuts-overlay");
  return overlay ? !overlay.classList.contains("hidden") : false;
}

export function setupShortcuts({
  state,
  canEdit,
  dispatch,
  undo,
  redo,
  setStatus,
  runButton
}: SetupShortcutsDeps): ShortcutsController {
  let focusTrap: FocusTrapController | null = null;
  const setOverlayVisible = (nextVisible: boolean): void => {
    const overlay = document.getElementById("shortcuts-overlay");
    if (!overlay) return;
    const currentlyVisible = !overlay.classList.contains("hidden");
    if (currentlyVisible === nextVisible) return;
    if (!nextVisible) {
      focusTrap?.deactivate();
      focusTrap = null;
      overlay.classList.add("hidden");
      return;
    }
    overlay.classList.remove("hidden");
    focusTrap = activateFocusTrap(overlay as HTMLElement);
  };

  const handleGlobalKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName || "";
    const isEditable = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || Boolean(target?.isContentEditable);
    const mod = event.metaKey || event.ctrlKey;

    if (shortcutsOverlayVisible()) {
      if (event.key === "Escape" || event.key === "F1" || event.key === "?") {
        event.preventDefault();
        setOverlayVisible(false);
      }
      return;
    }

    if (event.key === "F1" || (event.key === "?" && !isEditable)) {
      event.preventDefault();
      setOverlayVisible(true);
      return;
    }

    if (mod && !event.altKey && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      if (event.shiftKey) {
        const redone = redo();
        if (redone) setStatus("Redo");
      } else {
        const undone = undo();
        if (undone) setStatus("Undo");
      }
      return;
    }

    if (mod && !event.shiftKey && !event.altKey && (event.key === "e" || event.key === "E")) {
      event.preventDefault();
      dispatch({ type: "preset.toggleMode" });
      setStatus(`Mode: ${state.preset.ui.mode}`);
      return;
    }

    if (!canEdit() && !isEditable) {
      if (/^[1-9]$/.test(event.key)) {
        const idx = Number(event.key) - 1;
        const btn = sortedButtonsByPosition(state)[idx];
        if (btn) {
          event.preventDefault();
          runButton(btn);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "preset.setMode", mode: "edit" });
        setStatus("Mode: edit");
      }
    }
  };

  document.addEventListener("keydown", handleGlobalKeydown);

  const shortcutsOverlayEl = document.getElementById("shortcuts-overlay");
  const shortcutsDismissEl = document.getElementById("shortcuts-dismiss");
  if (shortcutsOverlayEl && shortcutsDismissEl) {
    shortcutsDismissEl.addEventListener("click", () => setOverlayVisible(false));
    shortcutsOverlayEl.addEventListener("click", (ev) => {
      if (ev.target === shortcutsOverlayEl) {
        setOverlayVisible(false);
      }
    });
  }
  return {
    toggleOverlay: (force?: boolean) => {
      if (typeof force === "boolean") {
        setOverlayVisible(force);
      } else {
        setOverlayVisible(!shortcutsOverlayVisible());
      }
    }
  };
}
