export type RightTab = "grid" | "connections" | "button";
export type SelectionTarget = "button" | "service" | null;

export interface UiState {
  selectedButtonId: string | null;
  selectedButtonIds: string[];
  selectedTarget: SelectionTarget;
  selectedContactId: string | null;
  activeRightTab: RightTab;
  isDirty: boolean;
}

export function createInitialUiState(): UiState {
  return {
    selectedButtonId: null,
    selectedButtonIds: [],
    selectedTarget: null,
    selectedContactId: null,
    activeRightTab: "grid",
    isDirty: false
  };
}
