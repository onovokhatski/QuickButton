type StartupDeps = {
  state: any;
  defaultPreset: () => any;
  dispatch: (command: any, options?: { render?: boolean; skipMarkDirty?: boolean }) => void;
  setPresetPath: (path: string | null) => void;
  setAppInfo: (value: any) => void;
  getAppInfo: () => any;
  loadLastPreset: () => Promise<any>;
  fetchAppInfo: () => Promise<any>;
  updateVersionBadge: () => void;
  showToast: (message: string, type?: string) => void;
  markClean: () => void;
  syncControlsFromPreset: () => void;
  bindEvents: () => void;
  subscribeRender: () => void;
  setupShellResizeObserver: () => void;
  render: () => void;
  setStatus: (message: string) => void;
  setWindowAlwaysOnTop: (value: boolean) => Promise<void>;
  setWindowIgnoreMouseEvents: (ignore: boolean) => Promise<void>;
};

export type StartupController = {
  init: () => Promise<void>;
};

export function createStartupController({
  state,
  defaultPreset,
  dispatch,
  setPresetPath,
  setAppInfo,
  getAppInfo,
  loadLastPreset,
  fetchAppInfo,
  updateVersionBadge,
  showToast,
  markClean,
  syncControlsFromPreset,
  bindEvents,
  subscribeRender,
  setupShellResizeObserver,
  render,
  setStatus,
  setWindowAlwaysOnTop,
  setWindowIgnoreMouseEvents
}: StartupDeps): StartupController {
  const init = async (): Promise<void> => {
    try {
      const loadedResult = await loadLastPreset();
      const loadedPreset = loadedResult?.preset ?? loadedResult;
      dispatch(
        { type: "preset.replace", preset: (loadedPreset ?? defaultPreset()) as Record<string, unknown> },
        { skipMarkDirty: true, render: false }
      );
      setPresetPath(loadedResult?.path ?? null);
      try {
        setAppInfo((await fetchAppInfo()) ?? getAppInfo());
      } catch {
        // Best effort only.
      }
      updateVersionBadge();
      if (loadedResult?.recoveredFromBackup) {
        showToast("Recovered last-used preset path from backup metadata", "info");
      }
      markClean();
      syncControlsFromPreset();
      bindEvents();
      subscribeRender();
      setupShellResizeObserver();
      render();
      setStatus(`M3 ready (${state.preset.ui.mode} mode)`);
      await setWindowAlwaysOnTop(Boolean(state.preset.ui.alwaysOnTop));
      await setWindowIgnoreMouseEvents(false);
    } catch (error: any) {
      dispatch(
        { type: "preset.replace", preset: defaultPreset() as Record<string, unknown> },
        { skipMarkDirty: true, render: false }
      );
      markClean();
      updateVersionBadge();
      bindEvents();
      setupShellResizeObserver();
      render();
      showToast(error?.message ?? "Failed to initialize preset");
    }
  };

  return { init };
}
