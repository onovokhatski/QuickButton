type InteractionDeps = {
  canEdit: () => boolean;
  clickThroughBackgroundEnabled: () => boolean;
  setIgnoreMouseEvents: (input: { ignore: boolean; forward: boolean }) => Promise<void>;
  getCursorInWindow: () => Promise<{ inside: boolean; x: number; y: number } | null>;
};

export type InteractionController = {
  setWindowIgnoreMouseEvents: (ignore: boolean) => Promise<void>;
  syncCursorPollFromState: () => void;
  updateClickThroughFromPointer: (event?: MouseEvent | PointerEvent) => void;
};

export function createInteractionController({
  canEdit,
  clickThroughBackgroundEnabled,
  setIgnoreMouseEvents,
  getCursorInWindow
}: InteractionDeps): InteractionController {
  let lastIgnoreMouseEvents: boolean | null = null;
  let cursorPollHandle: number | null = null;

  const setWindowIgnoreMouseEvents = async (ignore: boolean): Promise<void> => {
    if (lastIgnoreMouseEvents === ignore) {
      return;
    }
    lastIgnoreMouseEvents = ignore;
    try {
      await setIgnoreMouseEvents({ ignore, forward: true });
    } catch {
      // Ignore click-through IPC failures.
    }
  };

  const pointInsideRect = (x: number, y: number, rect: DOMRect): boolean => {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const isPointInsideInteractiveElement = (x: number, y: number): boolean => {
    const interactive = document.querySelectorAll(
      "button, input, select, textarea, [data-service-action], .user-btn"
    );
    for (const el of interactive) {
      if (!(el instanceof HTMLElement)) continue;
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.pointerEvents === "none"
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (pointInsideRect(x, y, rect)) {
        return true;
      }
    }
    return false;
  };

  const shouldEnableClickThroughForTarget = (target: EventTarget | null): boolean => {
    if (canEdit()) return false;
    if (!clickThroughBackgroundEnabled()) return false;
    if (!target || !(target instanceof Element)) return true;
    return !target.closest("button, input, select, textarea, [data-service-action], .user-btn");
  };

  const pollCursorAndUpdateClickThrough = async (): Promise<void> => {
    if (canEdit() || !clickThroughBackgroundEnabled()) {
      await setWindowIgnoreMouseEvents(false);
      return;
    }
    try {
      const info = await getCursorInWindow();
      if (!info?.inside) {
        await setWindowIgnoreMouseEvents(true);
        return;
      }
      const shouldIgnore = !isPointInsideInteractiveElement(info.x, info.y);
      await setWindowIgnoreMouseEvents(shouldIgnore);
    } catch {
      // Ignore polling failures.
    }
  };

  const startCursorPoll = (): void => {
    if (cursorPollHandle !== null) return;
    cursorPollHandle = window.setInterval(() => {
      pollCursorAndUpdateClickThrough();
    }, 60);
  };

  const stopCursorPoll = (): void => {
    if (cursorPollHandle === null) return;
    window.clearInterval(cursorPollHandle);
    cursorPollHandle = null;
  };

  const syncCursorPollFromState = (): void => {
    if (!canEdit() && clickThroughBackgroundEnabled()) {
      startCursorPoll();
    } else {
      stopCursorPoll();
      setWindowIgnoreMouseEvents(false);
    }
  };

  const updateClickThroughFromPointer = (event?: MouseEvent | PointerEvent): void => {
    const hasPoint = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY);
    if (hasPoint && isPointInsideInteractiveElement(event!.clientX, event!.clientY)) {
      setWindowIgnoreMouseEvents(false);
      return;
    }
    if (hasPoint && canEdit() === false && clickThroughBackgroundEnabled()) {
      setWindowIgnoreMouseEvents(true);
      return;
    }
    let target: EventTarget | null = null;
    if (hasPoint) {
      target = document.elementFromPoint(event!.clientX, event!.clientY);
    }
    if (!target) {
      target = event?.target ?? null;
    }
    const ignore = shouldEnableClickThroughForTarget(target);
    setWindowIgnoreMouseEvents(ignore);
  };

  return {
    setWindowIgnoreMouseEvents,
    syncCursorPollFromState,
    updateClickThroughFromPointer
  };
}
