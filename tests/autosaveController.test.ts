import { describe, expect, it, vi } from "vitest";
import { createAutoSaveController } from "../src/renderer/modules/autosave";

describe("autosave controller", () => {
  it("saves dirty preset to current path", async () => {
    const state = { preset: { foo: 1 }, ui: { isDirty: true } };
    const savePreset = vi.fn(async () => ({ path: "/tmp/preset.json" }));
    const setPresetPath = vi.fn();
    const render = vi.fn();
    const setStatus = vi.fn();
    const showToast = vi.fn();
    const controller = createAutoSaveController({
      state,
      getPresetPath: () => "/tmp/preset.json",
      setPresetPath,
      savePreset,
      render,
      setStatus,
      showToast
    });

    const saved = await controller.trigger("interval", { silent: true });
    expect(saved).toBe(true);
    expect(savePreset).toHaveBeenCalledTimes(1);
    expect(state.ui.isDirty).toBe(false);
    expect(render).toHaveBeenCalledTimes(1);
    expect(setStatus).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("does not save when there is no current file path", async () => {
    const state = { preset: { foo: 1 }, ui: { isDirty: true } };
    const savePreset = vi.fn(async () => ({ path: "/tmp/preset.json" }));
    const showToast = vi.fn();
    const controller = createAutoSaveController({
      state,
      getPresetPath: () => null,
      setPresetPath: vi.fn(),
      savePreset,
      render: vi.fn(),
      setStatus: vi.fn(),
      showToast
    });

    const saved = await controller.trigger("mode-switch", { force: true });
    expect(saved).toBe(false);
    expect(savePreset).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Autosave skipped: save preset to a file first", "info");
  });

  it("runs interval autosave every 30 seconds", async () => {
    vi.useFakeTimers();
    const state = { preset: { foo: 1 }, ui: { isDirty: true } };
    const savePreset = vi.fn(async () => ({ path: "/tmp/preset.json" }));
    const controller = createAutoSaveController({
      state,
      getPresetPath: () => "/tmp/preset.json",
      setPresetPath: vi.fn(),
      savePreset,
      render: vi.fn(),
      setStatus: vi.fn(),
      showToast: vi.fn(),
      intervalMs: 30000
    });

    controller.start();
    await vi.advanceTimersByTimeAsync(30000);
    expect(savePreset).toHaveBeenCalledTimes(1);
    controller.stop();
    vi.useRealTimers();
  });
});
