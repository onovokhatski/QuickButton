type WindowSizingDeps = {
  shellEl: HTMLElement | null;
  setContentSize: (payload: { width: number; height: number }) => Promise<void>;
};

export type WindowSizingController = {
  scheduleWindowResize: () => void;
  setupShellResizeObserver: () => void;
};

export function createWindowSizingController({
  shellEl,
  setContentSize
}: WindowSizingDeps): WindowSizingController {
  let resizeRaf: number | null = null;
  let shellResizeObserver: ResizeObserver | null = null;
  let lastSentSize = { width: 0, height: 0 };

  const scheduleWindowResize = (): void => {
    if (resizeRaf !== null) {
      window.cancelAnimationFrame(resizeRaf);
    }
    resizeRaf = window.requestAnimationFrame(async () => {
      resizeRaf = null;
      if (!shellEl) return;
      const shellRect = shellEl.getBoundingClientRect();
      const width = Math.ceil(Math.max(document.documentElement.scrollWidth, shellRect.width));
      const height = Math.ceil(Math.max(document.documentElement.scrollHeight, shellRect.height));
      if (width === lastSentSize.width && height === lastSentSize.height) {
        return;
      }
      lastSentSize = { width, height };
      try {
        await setContentSize({ width, height });
      } catch {
        // Ignore resize failures in renderer.
      }
    });
  };

  const setupShellResizeObserver = (): void => {
    if (!shellEl || !("ResizeObserver" in window) || shellResizeObserver) {
      return;
    }
    shellResizeObserver = new ResizeObserver(() => {
      scheduleWindowResize();
    });
    shellResizeObserver.observe(shellEl);
  };

  return {
    scheduleWindowResize,
    setupShellResizeObserver
  };
}
