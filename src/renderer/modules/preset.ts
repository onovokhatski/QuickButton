import type { AppCommand, AppDispatchOptions } from "./appCommands";

type PresetState = {
  preset: any;
  ui: {
    selectedButtonId: string | null;
    selectedButtonIds?: string[];
    selectedTarget: "button" | "service" | null;
    selectedContactId: string | null;
  };
};

type PresetDeps = {
  state: PresetState;
  getPresetPath: () => string | null;
  setPresetPath: (path: string | null) => void;
  confirmDiscardChanges: () => boolean;
  dispatch: (command: AppCommand, options?: AppDispatchOptions) => void;
  markClean: () => void;
  syncControlsFromPreset: () => void;
  render: () => void;
  setStatus: (message: string) => void;
  showToast: (message: string, type?: string) => void;
  openPreset: () => Promise<any>;
  savePreset: (input: { path: string | null; preset: any }) => Promise<{ path: string }>;
  saveAsPreset: (input: { preset: any }) => Promise<{ path: string }>;
};

export type PresetController = {
  handleOpenPreset: () => Promise<void>;
  handleSavePreset: () => Promise<void>;
  handleSaveAsPreset: () => Promise<void>;
  handleMenuPresetAction: (action: string) => Promise<boolean>;
};

export function createPresetController({
  state,
  getPresetPath,
  setPresetPath,
  confirmDiscardChanges,
  dispatch,
  markClean,
  syncControlsFromPreset,
  render,
  setStatus,
  showToast,
  openPreset,
  savePreset,
  saveAsPreset
}: PresetDeps): PresetController {
  const handleOpenPreset = async (): Promise<void> => {
    try {
      if (!confirmDiscardChanges()) return;
      const loaded = await openPreset();
      dispatch({ type: "preset.replace", preset: loaded as Record<string, unknown> }, {
        skipMarkDirty: true,
        render: false
      });
      setPresetPath(null);
      markClean();
      syncControlsFromPreset();
      render();
      setStatus("Preset loaded");
    } catch (error: any) {
      showToast(error?.message ?? "Open preset failed");
    }
  };

  const handleSavePreset = async (): Promise<void> => {
    try {
      const result = await savePreset({
        path: getPresetPath(),
        preset: state.preset
      });
      setPresetPath(result.path);
      markClean();
      render();
      setStatus("Preset saved");
    } catch (error: any) {
      showToast(error?.message ?? "Save failed");
    }
  };

  const handleSaveAsPreset = async (): Promise<void> => {
    try {
      const result = await saveAsPreset({ preset: state.preset });
      setPresetPath(result.path);
      markClean();
      render();
      setStatus("Preset saved as new file");
    } catch (error: any) {
      showToast(error?.message ?? "Save As failed");
    }
  };

  const handleMenuPresetAction = async (action: string): Promise<boolean> => {
    if (action === "open") {
      await handleOpenPreset();
      return true;
    }
    if (action === "save") {
      await handleSavePreset();
      return true;
    }
    if (action === "saveAs") {
      await handleSaveAsPreset();
      return true;
    }
    return false;
  };

  return {
    handleOpenPreset,
    handleSavePreset,
    handleSaveAsPreset,
    handleMenuPresetAction
  };
}
