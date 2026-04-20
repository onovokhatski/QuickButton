import { createInitialUiState, type UiState } from "./ui-state";

export interface RendererState<TPreset = unknown> {
  preset: TPreset | null;
  ui: UiState;
}

export interface RendererStore<TPreset = unknown> {
  getState(): RendererState<TPreset>;
  subscribe(fn: (state: RendererState<TPreset>) => void): () => void;
  commit(mutator?: (state: RendererState<TPreset>) => void): void;
  commitClean(mutator?: (state: RendererState<TPreset>) => void): void;
}

export function createRendererState<TPreset = unknown>(): RendererState<TPreset> {
  return {
    preset: null,
    ui: createInitialUiState()
  };
}

export function createRendererStore<TPreset = unknown>(
  state: RendererState<TPreset>
): RendererStore<TPreset> {
  const listeners = new Set<(s: RendererState<TPreset>) => void>();
  let notifying = false;
  let pending = false;

  const notify = (): void => {
    if (notifying) {
      pending = true;
      return;
    }
    notifying = true;
    try {
      for (const fn of listeners) {
        try {
          fn(state);
        } catch (err) {
          console.error("store listener error:", err);
        }
      }
    } finally {
      notifying = false;
      if (pending) {
        pending = false;
        notify();
      }
    }
  };

  return {
    getState(): RendererState<TPreset> {
      return state;
    },
    subscribe(fn: (s: RendererState<TPreset>) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    commit(mutator?: (s: RendererState<TPreset>) => void): void {
      if (typeof mutator === "function") {
        mutator(state);
      }
      state.ui.isDirty = true;
      notify();
    },
    commitClean(mutator?: (s: RendererState<TPreset>) => void): void {
      if (typeof mutator === "function") {
        mutator(state);
      }
      state.ui.isDirty = false;
      notify();
    }
  };
}
