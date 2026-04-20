import type { AppCommand, AppDispatchOptions } from "./appCommands";
import type { ButtonLike, CommandLike, RendererStateLike } from "./domainTypes";
import { trackOnboardingStep } from "./onboarding";

type EventsDeps = {
  state: RendererStateLike;
  canEdit: () => boolean;
  dispatch: (command: AppCommand, options?: AppDispatchOptions) => void;
  render: () => void;
  setStatus: (message: string) => void;
  showToast: (message: string, type?: string) => void;
  nowId: (prefix: string) => string;
  defaultCommand: (name?: string) => CommandLike;
  selectedButton: () => ButtonLike | null;
  selectedButtons: () => ButtonLike[];
  runButton: (btn: ButtonLike) => Promise<void>;
  getButtonAtCell: (col: number, row: number) => ButtonLike | null;
  isServiceCell: (col: number, row: number) => boolean;
  updateClickThroughFromPointer: (event?: MouseEvent) => void;
  setWindowIgnoreMouseEvents: (ignore: boolean) => void;
  handleServiceAction: (action: string | null, source?: string | null) => boolean;
  bindConnectionsEvents: () => void;
  handleMenuPresetAction: (action: string) => Promise<boolean>;
  toggleShortcutsOverlay: () => void;
  setupShortcuts: () => void;
  setupOnboarding: () => void;
  MAX_BUTTONS: number;
  MAX_COMMANDS: number;
  els: {
    tabButtonSettingsEl: HTMLElement;
    tabGridSettingsEl: HTMLElement;
    tabConnectionsSettingsEl: HTMLElement;
    alwaysOnTopEl: HTMLInputElement;
    gridColsEl: HTMLInputElement;
    gridRowsEl: HTMLInputElement;
    btnSizeWEl: HTMLInputElement;
    btnSizeHEl: HTMLInputElement;
    onErrorEl: HTMLInputElement | HTMLSelectElement;
    clickThroughBackgroundEl: HTMLInputElement;
    showServiceInGridEl: HTMLInputElement;
    gridBgColorEl: HTMLInputElement;
    gridBgOpacityEl: HTMLInputElement;
    gridBgOpacityValueEl: HTMLElement;
    btnLabelEl: HTMLInputElement;
    btnBgEl: HTMLInputElement;
    btnFgEl: HTMLInputElement;
    btnFontEl: HTMLInputElement;
    btnWrapEl: HTMLElement;
    btnRadiusEl: HTMLInputElement;
    btnIconPickEl: HTMLElement;
    btnIconClearEl: HTMLElement;
    btnIconDarkenEl: HTMLInputElement;
    btnLabelVisibilityEl: HTMLInputElement | HTMLSelectElement;
    serviceRadiusEl: HTMLInputElement;
  };
};

export type EventsController = {
  bindEvents: () => void;
};

export function createEventsController({
  state,
  canEdit,
  dispatch,
  render,
  setStatus,
  showToast,
  nowId,
  defaultCommand,
  selectedButton,
  selectedButtons,
  runButton,
  getButtonAtCell,
  isServiceCell,
  updateClickThroughFromPointer,
  setWindowIgnoreMouseEvents,
  handleServiceAction,
  bindConnectionsEvents,
  handleMenuPresetAction,
  toggleShortcutsOverlay,
  setupShortcuts,
  setupOnboarding,
  MAX_BUTTONS,
  MAX_COMMANDS,
  els
}: EventsDeps): EventsController {
  let bound = false;

  const bindEvents = (): void => {
    if (bound) return;
    bound = true;

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const actionEl = target?.closest("[data-service-action]");
      if (!actionEl) return;
      const source = actionEl.getAttribute("data-service-source") ?? "grid";
      const action = actionEl.getAttribute("data-service-action");
      const handled = handleServiceAction(action, source);
      if (handled) {
        return;
      }
    });

    const tabs = [
      { key: "grid", el: els.tabGridSettingsEl },
      { key: "connections", el: els.tabConnectionsSettingsEl },
      { key: "button", el: els.tabButtonSettingsEl }
    ] as const;
    const setActiveTab = (tabKey: "grid" | "connections" | "button"): void => {
      state.ui.activeRightTab = tabKey;
      render();
    };
    const focusTabByIndex = (index: number): void => {
      tabs[(index + tabs.length) % tabs.length].el.focus();
    };

    tabs.forEach(({ key, el }, index) => {
      el.addEventListener("click", () => setActiveTab(key));
      el.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          focusTabByIndex(index + 1);
          setActiveTab(tabs[(index + 1) % tabs.length].key);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          focusTabByIndex(index - 1);
          setActiveTab(tabs[(index - 1 + tabs.length) % tabs.length].key);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          focusTabByIndex(0);
          setActiveTab(tabs[0].key);
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          focusTabByIndex(tabs.length - 1);
          setActiveTab(tabs[tabs.length - 1].key);
        }
      });
    });

    bindConnectionsEvents();

    els.alwaysOnTopEl.addEventListener("change", async () => {
      if (!canEdit()) return;
      dispatch({ type: "preset.setAlwaysOnTop", value: els.alwaysOnTopEl.checked });
      await window.quickButtonApi.window.setAlwaysOnTop({ value: els.alwaysOnTopEl.checked });
    });
    if (window.quickButtonApi.menu?.onAction) {
      window.quickButtonApi.menu.onAction(async (action, payload) => {
        if (await handleMenuPresetAction(action)) {
          return;
        }
        if (action === "viewEdit") {
          dispatch({ type: "preset.setMode", mode: "edit" });
          setStatus("Mode: edit");
          return;
        }
        if (action === "viewRun") {
          dispatch({ type: "preset.setMode", mode: "use" });
          setStatus("Mode: use");
          return;
        }
        if (action === "viewToggleServiceGrid") {
          const next = Boolean((payload as { value?: unknown } | undefined)?.value);
          els.showServiceInGridEl.checked = next;
          dispatch({ type: "service.setShowInGrid", value: next });
          return;
        }
        if (action === "viewShowShortcuts") {
          toggleShortcutsOverlay();
        }
      });
    }

    document.getElementById("add-button")?.addEventListener("click", () => {
      if (!canEdit()) {
        showToast("Switch to edit mode to modify layout");
        return;
      }
      if (state.preset.buttons.length >= MAX_BUTTONS) {
        showToast("Max 100 buttons reached");
        return;
      }
      let freeCell: { col: number; row: number } | null = null;
      for (let row = 0; row < state.preset.ui.grid.rows; row += 1) {
        for (let col = 0; col < state.preset.ui.grid.cols; col += 1) {
          if (isServiceCell(col, row)) continue;
          if (!getButtonAtCell(col, row)) {
            freeCell = { col, row };
            break;
          }
        }
        if (freeCell) break;
      }
      if (!freeCell) {
        showToast("No free grid cell");
        return;
      }
      const btn = {
        id: nowId("btn"),
        label: `Btn ${state.preset.buttons.length + 1}`,
        style: {
          bgColor: "#252525",
          textColor: "#ffffff",
          fontSize: 13,
          radius: 8
        },
        position: freeCell,
        commands: [defaultCommand("Command 1")]
      };
      dispatch({ type: "layout.addButton", button: btn });
      trackOnboardingStep("button");
    });

    document.getElementById("run-selected")?.addEventListener("click", async () => {
      const btn = selectedButton();
      if (!btn) {
        showToast("Select a button first");
        return;
      }
      await runButton(btn);
    });

    document.getElementById("delete-button")?.addEventListener("click", () => {
      if (!canEdit()) {
        showToast("Switch to edit mode to modify layout");
        return;
      }
      const btn = selectedButton();
      if (!btn) return;
      const commandCount = Array.isArray(btn.commands) ? btn.commands.length : 0;
      const confirmed = window.confirm(
        `Delete button "${btn.label || "Untitled"}" with ${commandCount} command${commandCount === 1 ? "" : "s"}?`
      );
      if (!confirmed) return;
      dispatch({ type: "layout.deleteButton", buttonId: btn.id });
    });

    document.getElementById("add-command")?.addEventListener("click", () => {
      if (!canEdit()) {
        showToast("Switch to edit mode to edit commands");
        return;
      }
      const btn = selectedButton();
      if (!btn) return;
      if (btn.commands.length >= MAX_COMMANDS) {
        showToast("Max 10 commands per button");
        return;
      }
      dispatch({
        type: "button.appendCommand",
        buttonId: btn.id,
        command: defaultCommand(`Command ${btn.commands.length + 1}`)
      });
    });

    [
      els.gridColsEl,
      els.gridRowsEl,
      els.btnSizeWEl,
      els.btnSizeHEl,
      els.onErrorEl,
      els.clickThroughBackgroundEl,
      els.showServiceInGridEl,
      els.gridBgColorEl,
      els.gridBgOpacityEl
    ].forEach((el) => {
      el.addEventListener("change", () => {
        if (!canEdit()) return;
        if (el === els.gridColsEl) {
          dispatch({ type: "preset.setGridCols", cols: Number(els.gridColsEl.value) }, { historyGroup: "grid-cols" });
          return;
        }
        if (el === els.gridRowsEl) {
          dispatch({ type: "preset.setGridRows", rows: Number(els.gridRowsEl.value) }, { historyGroup: "grid-rows" });
          return;
        }
        if (el === els.btnSizeWEl) {
          dispatch({ type: "preset.setButtonSizeW", width: Number(els.btnSizeWEl.value) }, { historyGroup: "btn-size-w" });
          return;
        }
        if (el === els.btnSizeHEl) {
          dispatch({ type: "preset.setButtonSizeH", height: Number(els.btnSizeHEl.value) }, { historyGroup: "btn-size-h" });
          return;
        }
        if (el === els.onErrorEl) {
          dispatch({
            type: "preset.setOnCommandError",
            onError: (els.onErrorEl as HTMLInputElement).value === "continue" ? "continue" : "stop"
          });
          return;
        }
        if (el === els.clickThroughBackgroundEl) {
          dispatch({
            type: "preset.setClickThroughBackground",
            value: els.clickThroughBackgroundEl.checked
          }, { historyGroup: "click-through-background" });
          return;
        }
        if (el === els.showServiceInGridEl) {
          dispatch({
            type: "service.setShowInGrid",
            value: els.showServiceInGridEl.checked
          }, { historyGroup: "service-show-in-grid" });
          if (window.quickButtonApi.menu?.setShowServiceInGrid) {
            window.quickButtonApi.menu.setShowServiceInGrid({
              value: els.showServiceInGridEl.checked
            });
          }
          return;
        }
        if (el === els.gridBgColorEl) {
          dispatch({
            type: "preset.setGridBgColor",
            color: String(els.gridBgColorEl.value || "#000000")
          }, { historyGroup: "grid-bg-color" });
          return;
        }
        if (el === els.gridBgOpacityEl) {
          els.gridBgOpacityValueEl.textContent = `${els.gridBgOpacityEl.value}%`;
          dispatch({
            type: "preset.setGridBgOpacityPercent",
            opacityPercent: Number(els.gridBgOpacityEl.value)
          }, { historyGroup: "grid-bg-opacity" });
          return;
        }
        if (el === els.showServiceInGridEl && window.quickButtonApi.menu?.setShowServiceInGrid) {
          window.quickButtonApi.menu.setShowServiceInGrid({
            value: els.showServiceInGridEl.checked
          });
        }
      });
    });
    els.gridBgOpacityEl.addEventListener("input", () => {
      if (!canEdit()) return;
      els.gridBgOpacityValueEl.textContent = `${els.gridBgOpacityEl.value}%`;
      dispatch({
        type: "preset.setGridBgOpacityPercent",
        opacityPercent: Number(els.gridBgOpacityEl.value)
      }, { historyGroup: "grid-bg-opacity" });
    });

    els.btnLabelEl.addEventListener("input", () => {
      if (!canEdit()) return;
      const selected = selectedButtons();
      if (selected.length !== 1) return;
      dispatch({ type: "button.setLabel", buttonId: selected[0].id, label: els.btnLabelEl.value }, { historyGroup: "button-label" });
    });
    els.btnBgEl.addEventListener("input", () => {
      if (!canEdit()) return;
      const selected = selectedButtons();
      if (selected.length === 0) return;
      dispatch({
        type: "button.setBgColor",
        buttonIds: selected.map((b) => b.id),
        color: els.btnBgEl.value
      }, { historyGroup: "button-bg" });
    });
    els.btnFgEl.addEventListener("input", () => {
      if (!canEdit()) return;
      const selected = selectedButtons();
      if (selected.length === 0) return;
      dispatch({
        type: "button.setTextColor",
        buttonIds: selected.map((b) => b.id),
        color: els.btnFgEl.value
      }, { historyGroup: "button-fg" });
    });
    els.btnFontEl.addEventListener("input", () => {
      if (!canEdit()) return;
      const selected = selectedButtons();
      if (selected.length === 0 || !els.btnFontEl.value) return;
      dispatch({
        type: "button.setFontSize",
        buttonIds: selected.map((b) => b.id),
        fontSize: Number(els.btnFontEl.value)
      }, { historyGroup: "button-font" });
    });
    els.btnWrapEl.addEventListener("click", () => {
      if (!canEdit()) return;
      const btn = selectedButton();
      if (!btn) return;
      dispatch({ type: "button.toggleWrapLabel", buttonId: btn.id });
    });
    els.btnRadiusEl.addEventListener("input", () => {
      if (!canEdit()) return;
      const selected = selectedButtons();
      if (selected.length === 0 || !els.btnRadiusEl.value) return;
      dispatch({
        type: "button.setRadius",
        buttonIds: selected.map((b) => b.id),
        radius: Number(els.btnRadiusEl.value)
      }, { historyGroup: "button-radius" });
    });
    els.btnIconPickEl.addEventListener("click", async () => {
      if (!canEdit()) return;
      const btn = selectedButton();
      if (!btn) return;
      try {
        const result = await window.quickButtonApi.dialog.pickIconFile({ currentPath: "" });
        if (result?.canceled) return;
        if (!result?.assetId) {
          showToast(result?.error ?? "Failed to pick icon");
          return;
        }
        dispatch({ type: "button.setIconAssetId", buttonId: btn.id, assetId: result.assetId });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Failed to pick icon: ${message}`);
      }
    });
    els.btnIconClearEl.addEventListener("click", () => {
      if (!canEdit()) return;
      const btn = selectedButton();
      if (!btn) return;
      if (!btn.style.iconAssetId && !btn.style.iconPath) return;
      dispatch({ type: "button.clearIcon", buttonId: btn.id });
    });
    els.btnIconDarkenEl.addEventListener("input", () => {
      if (!canEdit()) return;
      const btn = selectedButton();
      if (!btn) return;
      dispatch({
        type: "button.setIconDarken",
        buttonId: btn.id,
        iconDarken: Number(els.btnIconDarkenEl.value)
      }, { historyGroup: "button-icon-darken" });
    });
    els.btnLabelVisibilityEl.addEventListener("change", () => {
      if (!canEdit()) return;
      const btn = selectedButton();
      if (!btn) return;
      dispatch({
        type: "button.setLabelVisibility",
        buttonId: btn.id,
        labelVisibility: (els.btnLabelVisibilityEl as HTMLInputElement).value
      });
    });
    els.serviceRadiusEl.addEventListener("input", () => {
      if (!canEdit()) return;
      dispatch({
        type: "service.setRadius",
        radius: Math.max(0, Math.min(24, Number(els.serviceRadiusEl.value) || 0))
      }, { historyGroup: "service-radius" });
    });

    document.addEventListener("mousemove", (event) => {
      updateClickThroughFromPointer(event);
    });
    document.addEventListener(
      "pointerover",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-service-action="drag"]')) {
          setWindowIgnoreMouseEvents(false);
        }
      },
      true
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-service-action="drag"]')) {
          setWindowIgnoreMouseEvents(false);
        }
      },
      true
    );
    document.addEventListener("mouseleave", () => {
      updateClickThroughFromPointer();
    });

    setupShortcuts();
    setupOnboarding();
  };

  return {
    bindEvents
  };
}
