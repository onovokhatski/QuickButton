type AutoSaveState = {
  preset: unknown;
  ui: {
    isDirty: boolean;
  };
};

type AutoSaveDeps = {
  state: AutoSaveState;
  getPresetPath: () => string | null;
  setPresetPath: (path: string | null) => void;
  savePreset: (input: { path: string; preset: unknown }) => Promise<{ path: string }>;
  render: () => void;
  setStatus: (message: string) => void;
  showToast: (message: string, type?: string) => void;
  intervalMs?: number;
};

type TriggerOptions = {
  force?: boolean;
  silent?: boolean;
};

export type AutoSaveController = {
  start: () => void;
  stop: () => void;
  trigger: (reason: string, options?: TriggerOptions) => Promise<boolean>;
};

export function createAutoSaveController({
  state,
  getPresetPath,
  setPresetPath,
  savePreset,
  render,
  setStatus,
  showToast,
  intervalMs = 30000
}: AutoSaveDeps): AutoSaveController {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<boolean> | null = null;
  let queued: { reason: string; options?: TriggerOptions } | null = null;
  let warnedNoPath = false;

  const runSave = async (reason: string, options: TriggerOptions = {}): Promise<boolean> => {
    if (!options.force && !state.ui.isDirty) {
      return false;
    }
    const path = getPresetPath();
    if (!path) {
      if (!options.silent && !warnedNoPath) {
        warnedNoPath = true;
        showToast("Autosave skipped: save preset to a file first", "info");
      }
      return false;
    }

    try {
      const result = await savePreset({ path, preset: state.preset });
      setPresetPath(result?.path ?? path);
      warnedNoPath = false;
      state.ui.isDirty = false;
      render();
      if (!options.silent) {
        setStatus(`Autosaved (${reason})`);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!options.silent) {
        showToast(`Autosave failed: ${message}`, "error");
      }
      return false;
    }
  };

  const flushQueue = async (): Promise<void> => {
    if (!queued) return;
    const next = queued;
    queued = null;
    inFlight = runSave(next.reason, next.options);
    await inFlight;
    inFlight = null;
    if (queued) {
      await flushQueue();
    }
  };

  const trigger = async (reason: string, options?: TriggerOptions): Promise<boolean> => {
    if (inFlight) {
      queued = { reason, options };
      return false;
    }
    inFlight = runSave(reason, options);
    const saved = await inFlight;
    inFlight = null;
    if (queued) {
      await flushQueue();
    }
    return saved;
  };

  const start = (): void => {
    if (timer) return;
    timer = setInterval(() => {
      void trigger("interval", { silent: true });
    }, intervalMs);
  };

  const stop = (): void => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  return {
    start,
    stop,
    trigger
  };
}
