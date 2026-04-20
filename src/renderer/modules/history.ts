import type { AppCommand } from "./appCommands";
import { applyAppCommand } from "./appCommands";

type HistoryUiState = {
  selectedButtonId: string | null;
  selectedTarget: "button" | "service" | null;
  selectedButtonIds?: string[];
  selectedContactId?: string | null;
  activeRightTab?: string;
};

type HistoryDeps = {
  state: {
    preset: unknown;
    ui: {
      selectedButtonId: string | null;
      selectedTarget: "button" | "service" | null;
      selectedButtonIds?: string[];
      selectedContactId?: string | null;
      activeRightTab?: string;
      isDirty: boolean;
    };
  };
  render: () => void;
  limit?: number;
};

export type HistoryController = {
  reset: () => void;
  record: (
    entry: { forward: AppCommand[]; backward: AppCommand[]; uiBefore: HistoryUiState; uiAfter: HistoryUiState },
    options?: { groupKey?: string }
  ) => void;
  undo: () => boolean;
  redo: () => boolean;
};

type HistoryEntry = {
  forward: AppCommand[];
  backward: AppCommand[];
  uiBefore: HistoryUiState;
  uiAfter: HistoryUiState;
  groupKey?: string;
};

function applyUiState(state: HistoryDeps["state"], ui: HistoryUiState): void {
  state.ui.selectedButtonId = ui.selectedButtonId ?? null;
  state.ui.selectedTarget = ui.selectedTarget ?? null;
  state.ui.selectedButtonIds = Array.isArray(ui.selectedButtonIds) ? [...ui.selectedButtonIds] : [];
  state.ui.selectedContactId = ui.selectedContactId ?? null;
  state.ui.activeRightTab = ui.activeRightTab ?? state.ui.activeRightTab;
}

export function createHistoryController({
  state,
  render,
  limit = 50
}: HistoryDeps): HistoryController {
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];

  const reset = (): void => {
    undoStack = [];
    redoStack = [];
  };

  const record = (entry: HistoryEntry, options?: { groupKey?: string }): void => {
    if (!entry.backward.length || !entry.forward.length) return;
    const groupKey = options?.groupKey;
    const previous = undoStack[undoStack.length - 1];
    if (groupKey && previous?.groupKey === groupKey) {
      previous.forward = entry.forward;
      previous.uiAfter = entry.uiAfter;
      redoStack = [];
      return;
    }
    undoStack.push({ ...entry, groupKey });
    redoStack = [];
    if (undoStack.length > limit) {
      undoStack = undoStack.slice(undoStack.length - limit);
    }
  };

  const undo = (): boolean => {
    if (undoStack.length === 0) return false;
    const entry = undoStack.pop();
    if (!entry) return false;
    for (const cmd of entry.backward) {
      applyAppCommand(state, cmd);
    }
    applyUiState(state, entry.uiBefore);
    redoStack.push(entry);
    state.ui.isDirty = true;
    render();
    return true;
  };

  const redo = (): boolean => {
    if (redoStack.length === 0) return false;
    const entry = redoStack.pop();
    if (!entry) return false;
    for (const cmd of entry.forward) {
      applyAppCommand(state, cmd);
    }
    applyUiState(state, entry.uiAfter);
    undoStack.push(entry);
    state.ui.isDirty = true;
    render();
    return true;
  };

  return {
    reset,
    record,
    undo,
    redo
  };
}
