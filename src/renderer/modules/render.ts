import type { ButtonLike, RendererStateLike } from "./domainTypes";

type RenderDeps = {
  state: RendererStateLike;
  getPresetPath: () => string | null;
  canEdit: () => boolean;
  selectedButton: () => ButtonLike | null;
  selectedButtons: () => ButtonLike[];
  serviceConfig: () => { showInGrid?: boolean; radius?: number };
  syncCursorPollFromState: () => void;
  scheduleWindowResize: () => void;
  renderGrid: () => void;
  renderEditor: () => void;
  renderConnectionsPanel: () => void;
  els: {
    presetPathEl: HTMLElement;
    panelButtonSettingsEl: HTMLElement;
    panelGridSettingsEl: HTMLElement;
    panelConnectionsSettingsEl: HTMLElement;
    tabButtonSettingsEl: HTMLElement;
    tabGridSettingsEl: HTMLElement;
    tabConnectionsSettingsEl: HTMLElement;
    gridColsEl: HTMLInputElement;
    gridRowsEl: HTMLInputElement;
    btnSizeWEl: HTMLInputElement;
    btnSizeHEl: HTMLInputElement;
    onErrorEl: HTMLInputElement | HTMLSelectElement;
    alwaysOnTopEl: HTMLInputElement;
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
    btnIconClearEl: HTMLButtonElement;
    btnIconDarkenEl: HTMLInputElement;
    btnLabelVisibilityEl: HTMLInputElement | HTMLSelectElement;
    btnPreviewEl: HTMLElement;
    noSelectionEl: HTMLElement;
    editorFieldsEl: HTMLElement;
    serviceEditorEl: HTMLElement;
    serviceRadiusEl: HTMLInputElement;
  };
};

export type RenderController = {
  clickThroughBackgroundEnabled: () => boolean;
  gridBackgroundConfig: () => { color: string; opacity: number };
  applyButtonStyleToElement: (uiEl: HTMLElement, btn: ButtonLike) => void;
  applyEditorFromSelection: () => void;
  syncControlsFromPreset: () => void;
  render: () => void;
};

export function createRenderController({
  state,
  getPresetPath,
  canEdit,
  selectedButton,
  selectedButtons,
  serviceConfig,
  syncCursorPollFromState,
  scheduleWindowResize,
  renderGrid,
  renderEditor,
  renderConnectionsPanel,
  els
}: RenderDeps): RenderController {
  const clickThroughBackgroundEnabled = (): boolean =>
    typeof state.preset.ui.clickThroughBackground === "boolean"
      ? state.preset.ui.clickThroughBackground
      : true;

  const gridBackgroundConfig = (): { color: string; opacity: number } => {
    const raw = state.preset.ui.gridBackground;
    const rawColor = String(raw?.color ?? "#000000").trim();
    const color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#000000";
    const rawOpacity = Number(raw?.opacity);
    const opacity = Number.isFinite(rawOpacity) ? Math.max(0, Math.min(1, rawOpacity)) : 0.25;
    return { color, opacity };
  };

  const buttonIconSrc = (btn: ButtonLike | null): string => {
    const assetId = btn?.style?.iconAssetId;
    if (assetId && /^[a-f0-9]{40}$/.test(assetId)) {
      return `qb-asset://${assetId}`;
    }
    return "";
  };

  const hasButtonIcon = (btn: ButtonLike | null): boolean => Boolean(buttonIconSrc(btn));

  const syncIconClearEnabled = (btn: ButtonLike | null): void => {
    els.btnIconClearEl.disabled = !hasButtonIcon(btn);
  };

  const syncControlsFromPreset = (): void => {
    els.gridColsEl.value = String(state.preset.ui.grid.cols);
    els.gridRowsEl.value = String(state.preset.ui.grid.rows);
    els.btnSizeWEl.value = String(state.preset.ui.buttonSize.w);
    els.btnSizeHEl.value = String(state.preset.ui.buttonSize.h);
    const gridBg = gridBackgroundConfig();
    els.gridBgColorEl.value = gridBg.color;
    const opacityPercent = Math.round(gridBg.opacity * 100);
    els.gridBgOpacityEl.value = String(opacityPercent);
    els.gridBgOpacityValueEl.textContent = `${opacityPercent}%`;
    (els.onErrorEl as HTMLInputElement).value = state.preset.settings.onCommandError;
    els.alwaysOnTopEl.checked = Boolean(state.preset.ui.alwaysOnTop);
    els.clickThroughBackgroundEl.checked = clickThroughBackgroundEnabled();
    els.showServiceInGridEl.checked = Boolean(serviceConfig().showInGrid);
    if (window.quickButtonApi.menu?.setShowServiceInGrid) {
      window.quickButtonApi.menu.setShowServiceInGrid({ value: els.showServiceInGridEl.checked });
    }
  };

  const applyButtonStyleToElement = (uiEl: HTMLElement, btn: ButtonLike): void => {
    uiEl.classList.toggle("wrap", Boolean(btn.style.wrapLabel));
    uiEl.style.backgroundColor = btn.style.bgColor;
    uiEl.style.color = btn.style.textColor;
    uiEl.style.setProperty("--btn-text-color", btn.style.textColor);
    uiEl.style.fontSize = `${btn.style.fontSize}px`;
    uiEl.style.borderRadius = `${btn.style.radius}px`;
    const labelVisibility = btn.style.labelVisibility ?? "always";
    uiEl.dataset.labelVisibility = labelVisibility;
    const iconSrc = buttonIconSrc(btn);
    if (iconSrc) {
      uiEl.classList.add("has-bg-icon");
      const darken = Math.max(0, Math.min(100, Number(btn.style.iconDarken ?? 35))) / 100;
      uiEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,${darken}), rgba(0,0,0,${darken})), url("${iconSrc}")`;
      uiEl.style.backgroundSize = "cover";
      uiEl.style.backgroundPosition = "center";
      uiEl.style.backgroundRepeat = "no-repeat";
    } else {
      uiEl.classList.remove("has-bg-icon");
      uiEl.style.backgroundImage = "";
    }
  };

  const updateButtonPreview = (btn: ButtonLike | null): void => {
    if (!els.btnPreviewEl) return;
    if (!btn) {
      els.btnPreviewEl.classList.remove("wrap", "has-bg-icon");
      els.btnPreviewEl.removeAttribute("style");
      els.btnPreviewEl.removeAttribute("data-label-visibility");
      els.btnPreviewEl.textContent = "";
      return;
    }
    els.btnPreviewEl.textContent = btn.label || "Label";
    applyButtonStyleToElement(els.btnPreviewEl, btn);
    const size = state.preset?.ui?.buttonSize ?? { w: 72, h: 72 };
    els.btnPreviewEl.style.width = `${size.w}px`;
    els.btnPreviewEl.style.height = `${size.h}px`;
  };

  const getMixed = (
    buttons: ButtonLike[],
    getter: (btn: ButtonLike) => unknown
  ): { mixed: boolean; value: unknown } => {
    if (buttons.length === 0) return { mixed: false, value: null };
    const first = getter(buttons[0]);
    const mixed = buttons.some((btn) => getter(btn) !== first);
    return { mixed, value: first };
  };

  const applyEditorFromSelection = (): void => {
    const btn = state.ui.selectedTarget === "button" ? selectedButton() : null;
    const selected = state.ui.selectedTarget === "button" ? selectedButtons() : [];
    const isBulkMode = selected.length > 1;
    const serviceSelected = state.ui.selectedTarget === "service";
    const showServiceEditor = canEdit() && serviceSelected && !isBulkMode;
    const hasSelection = Boolean(btn || serviceSelected || isBulkMode);

    els.noSelectionEl.classList.toggle("hidden", hasSelection);
    els.editorFieldsEl.classList.toggle("hidden", !(btn || isBulkMode));
    els.serviceEditorEl.classList.toggle("hidden", !showServiceEditor);

    if (isBulkMode) {
      const labelTitle = `${selected.length} buttons selected`;
      els.btnLabelEl.value = labelTitle;
      els.btnLabelEl.disabled = true;
      const bg = getMixed(selected, (item) => item.style.bgColor);
      const fg = getMixed(selected, (item) => item.style.textColor);
      const font = getMixed(selected, (item) => item.style.fontSize);
      const radius = getMixed(selected, (item) => item.style.radius);
      els.btnBgEl.value = String(bg.value ?? "#252525");
      els.btnFgEl.value = String(fg.value ?? "#ffffff");
      els.btnBgEl.title = bg.mixed ? "mixed values" : "";
      els.btnFgEl.title = fg.mixed ? "mixed values" : "";
      els.btnFontEl.value = font.mixed ? "" : String(font.value ?? 13);
      els.btnFontEl.placeholder = font.mixed ? "mixed" : "";
      els.btnRadiusEl.value = radius.mixed ? "" : String(radius.value ?? 8);
      els.btnRadiusEl.placeholder = radius.mixed ? "mixed" : "";
      syncIconClearEnabled(null);
      els.btnWrapEl.classList.remove("active");
      els.btnWrapEl.setAttribute("aria-pressed", "false");
      els.btnPreviewEl.textContent = labelTitle;
      els.btnPreviewEl.removeAttribute("style");
      els.btnPreviewEl.removeAttribute("data-label-visibility");
    } else if (btn) {
      els.btnLabelEl.disabled = false;
      els.btnFontEl.placeholder = "";
      els.btnRadiusEl.placeholder = "";
      els.btnLabelEl.value = btn.label;
      els.btnBgEl.value = btn.style.bgColor;
      els.btnFgEl.value = btn.style.textColor;
      els.btnBgEl.title = "";
      els.btnFgEl.title = "";
      els.btnFontEl.value = String(btn.style.fontSize);
      els.btnRadiusEl.value = String(btn.style.radius);
      els.btnIconDarkenEl.value = String(btn.style.iconDarken ?? 35);
      (els.btnLabelVisibilityEl as HTMLInputElement).value = btn.style.labelVisibility ?? "always";
      syncIconClearEnabled(btn);
      const wrapActive = Boolean(btn.style.wrapLabel);
      els.btnWrapEl.classList.toggle("active", wrapActive);
      els.btnWrapEl.setAttribute("aria-pressed", wrapActive ? "true" : "false");
    } else {
      els.btnLabelEl.disabled = false;
      els.btnBgEl.title = "";
      els.btnFgEl.title = "";
      els.btnFontEl.placeholder = "";
      els.btnRadiusEl.placeholder = "";
    }
    updateButtonPreview(isBulkMode ? null : btn);
    els.serviceRadiusEl.value = String(serviceConfig().radius ?? 8);
  };

  const render = (): void => {
    const isEdit = canEdit();
    document.body.classList.toggle("mode-use", !isEdit);
    document.body.classList.toggle("mode-edit", isEdit);
    renderGrid();
    renderEditor();
    renderConnectionsPanel();
    els.panelButtonSettingsEl.classList.toggle("hidden", state.ui.activeRightTab !== "button");
    els.panelGridSettingsEl.classList.toggle("hidden", state.ui.activeRightTab !== "grid");
    els.panelConnectionsSettingsEl.classList.toggle(
      "hidden",
      state.ui.activeRightTab !== "connections"
    );
    const tabStates = [
      { active: state.ui.activeRightTab === "button", tabEl: els.tabButtonSettingsEl, panelEl: els.panelButtonSettingsEl },
      { active: state.ui.activeRightTab === "grid", tabEl: els.tabGridSettingsEl, panelEl: els.panelGridSettingsEl },
      {
        active: state.ui.activeRightTab === "connections",
        tabEl: els.tabConnectionsSettingsEl,
        panelEl: els.panelConnectionsSettingsEl
      }
    ];
    tabStates.forEach(({ active, tabEl, panelEl }) => {
      tabEl.classList.toggle("active", active);
      tabEl.setAttribute("aria-selected", active ? "true" : "false");
      tabEl.setAttribute("tabindex", active ? "0" : "-1");
      panelEl.setAttribute("aria-hidden", active ? "false" : "true");
    });
    const dirtySuffix = state.ui.isDirty ? " *unsaved changes" : "";
    const presetPath = getPresetPath();
    els.presetPathEl.textContent = presetPath
      ? `Preset: ${presetPath}${dirtySuffix}`
      : `Preset: unsaved${dirtySuffix}`;

    const lockEditing = !canEdit();
    const editOnlyIds = [
      "grid-cols",
      "grid-rows",
      "btn-size-w",
      "btn-size-h",
      "on-error",
      "click-through-background",
      "show-service-in-grid",
      "add-button",
      "delete-button",
      "add-command",
      "btn-label",
      "btn-bg",
      "btn-fg",
      "btn-font",
      "btn-radius",
      "btn-icon-pick",
      "btn-icon-clear",
      "service-radius",
      "contact-name",
      "contact-protocol",
      "contact-host",
      "contact-port",
      "contact-new",
      "contact-save"
    ];
    for (const id of editOnlyIds) {
      const el = document.getElementById(id) as HTMLInputElement | HTMLButtonElement | null;
      if (el) {
        el.disabled = lockEditing;
      }
    }
    const bulkEditing = state.ui.selectedTarget === "button" && selectedButtons().length > 1;
    if (bulkEditing) {
      els.btnLabelEl.disabled = true;
    }
    syncCursorPollFromState();
    scheduleWindowResize();
  };

  return {
    clickThroughBackgroundEnabled,
    gridBackgroundConfig,
    applyButtonStyleToElement,
    applyEditorFromSelection,
    syncControlsFromPreset,
    render
  };
}
