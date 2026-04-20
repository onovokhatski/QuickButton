export type FocusTrapController = {
  deactivate: () => void;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(", ");
  return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export function activateFocusTrap(container: HTMLElement): FocusTrapController {
  const previousFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focusables = getFocusableElements(container);
  const first = focusables[0];
  if (first) {
    first.focus();
  } else {
    container.focus();
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;
    const items = getFocusableElements(container);
    if (items.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (event.shiftKey) {
      if (!active || active === firstItem || !container.contains(active)) {
        event.preventDefault();
        lastItem.focus();
      }
      return;
    }
    if (!active || active === lastItem || !container.contains(active)) {
      event.preventDefault();
      firstItem.focus();
    }
  };

  document.addEventListener("keydown", onKeyDown);

  return {
    deactivate: () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocused && document.contains(previousFocused)) {
        previousFocused.focus();
      }
    }
  };
}
