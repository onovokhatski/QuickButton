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
    panelWebSettingsEl: HTMLElement;
    tabButtonSettingsEl: HTMLElement;
    tabGridSettingsEl: HTMLElement;
    tabConnectionsSettingsEl: HTMLElement;
    tabWebSettingsEl: HTMLElement;
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
    btnBgTransparentEl: HTMLButtonElement;
    btnBorderColorEl: HTMLInputElement;
    btnFgEl: HTMLInputElement;
    btnFontEl: HTMLInputElement;
    btnAlignXLeftEl: HTMLButtonElement;
    btnAlignXCenterEl: HTMLButtonElement;
    btnAlignXRightEl: HTMLButtonElement;
    btnAlignYTopEl: HTMLButtonElement;
    btnAlignYMiddleEl: HTMLButtonElement;
    btnAlignYBottomEl: HTMLButtonElement;
    btnWrapEl: HTMLElement;
    btnRadiusEl: HTMLInputElement;
    btnIconClearEl: HTMLButtonElement;
    btnLabelVisibilityEl: HTMLInputElement | HTMLSelectElement;
    btnPreviewEl: HTMLElement;
    noSelectionEl: HTMLElement;
    editorFieldsEl: HTMLElement;
    serviceEditorEl: HTMLElement;
    serviceRadiusEl: HTMLInputElement;
    webServerEnabledEl: HTMLInputElement;
    webServerPortEl: HTMLInputElement;
    webServerStatusEl: HTMLElement;
    webServerUrlEl: HTMLElement;
    webServerRestartEl: HTMLButtonElement;
    webServerOpenEl: HTMLButtonElement;
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
    const webServer = state.preset.ui.webServer ?? {};
    els.webServerEnabledEl.checked = Boolean(webServer.enabled);
    els.webServerPortEl.value = String(Number(webServer.port) || 3210);
    if (window.quickButtonApi.menu?.setShowServiceInGrid) {
      window.quickButtonApi.menu.setShowServiceInGrid({ value: els.showServiceInGridEl.checked });
    }
  };

  const applyButtonStyleToElement = (uiEl: HTMLElement, btn: ButtonLike): void => {
    uiEl.classList.toggle("wrap", Boolean(btn.style.wrapLabel));
    const transparentBg = Number(btn.style.bgOpacity ?? 100) <= 0;
    uiEl.style.backgroundColor = transparentBg ? "transparent" : btn.style.bgColor;
    uiEl.style.borderColor = btn.style.borderColor ?? "#2f2f2f";
    uiEl.style.color = btn.style.textColor;
    uiEl.style.setProperty("--btn-text-color", btn.style.textColor);
    uiEl.style.fontSize = `${btn.style.fontSize}px`;
    uiEl.style.borderRadius = `${btn.style.radius}px`;
    const alignX = btn.style.textAlignX ?? "center";
    const alignY = btn.style.textAlignY ?? "middle";
    uiEl.style.justifyContent =
      alignX === "left" ? "flex-start" : alignX === "right" ? "flex-end" : "center";
    uiEl.style.alignItems =
      alignY === "top" ? "flex-start" : alignY === "bottom" ? "flex-end" : "center";
    uiEl.style.textAlign = alignX;
    const labelVisibility = btn.style.labelVisibility ?? "always";
    uiEl.dataset.labelVisibility = labelVisibility;
    const iconSrc = buttonIconSrc(btn);
    if (iconSrc) {
      uiEl.classList.add("has-bg-icon");
      uiEl.style.backgroundImage = `url("${iconSrc}")`;
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

  const setToggleState = (
    el: HTMLButtonElement,
    active: boolean,
    mixed = false
  ): void => {
    el.classList.toggle("active", active && !mixed);
    el.setAttribute("aria-pressed", mixed ? "mixed" : active ? "true" : "false");
    el.title = mixed ? "mixed values" : "";
  };

  const setAlignControls = (
    alignX: "left" | "center" | "right",
    alignY: "top" | "middle" | "bottom",
    mixedX = false,
    mixedY = false
  ): void => {
    setToggleState(els.btnAlignXLeftEl, alignX === "left", mixedX);
    setToggleState(els.btnAlignXCenterEl, alignX === "center", mixedX);
    setToggleState(els.btnAlignXRightEl, alignX === "right", mixedX);
    setToggleState(els.btnAlignYTopEl, alignY === "top", mixedY);
    setToggleState(els.btnAlignYMiddleEl, alignY === "middle", mixedY);
    setToggleState(els.btnAlignYBottomEl, alignY === "bottom", mixedY);
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
      const border = getMixed(selected, (item) => item.style.borderColor ?? "#2f2f2f");
      const fg = getMixed(selected, (item) => item.style.textColor);
      const font = getMixed(selected, (item) => item.style.fontSize);
      const radius = getMixed(selected, (item) => item.style.radius);
      const bgOp = getMixed(selected, (item) => item.style.bgOpacity ?? 100);
      const alignX = getMixed(selected, (item) => item.style.textAlignX ?? "center");
      const alignY = getMixed(selected, (item) => item.style.textAlignY ?? "middle");
      els.btnBgEl.value = String(bg.value ?? "#252525");
      els.btnBorderColorEl.value = String(border.value ?? "#2f2f2f");
      els.btnFgEl.value = String(fg.value ?? "#ffffff");
      els.btnBgEl.title = bg.mixed ? "mixed values" : "";
      els.btnBorderColorEl.title = border.mixed ? "mixed values" : "";
      els.btnFgEl.title = fg.mixed ? "mixed values" : "";
      els.btnFontEl.value = font.mixed ? "" : String(font.value ?? 13);
      els.btnFontEl.placeholder = font.mixed ? "mixed" : "";
      els.btnRadiusEl.value = radius.mixed ? "" : String(radius.value ?? 8);
      els.btnRadiusEl.placeholder = radius.mixed ? "mixed" : "";
      const transparentOn = Number(bgOp.value ?? 100) <= 0;
      els.btnBgTransparentEl.classList.toggle("active", !bgOp.mixed && transparentOn);
      els.btnBgTransparentEl.setAttribute("aria-pressed", bgOp.mixed ? "mixed" : transparentOn ? "true" : "false");
      els.btnBgTransparentEl.title = bgOp.mixed ? "mixed values" : "";
      setAlignControls(
        (alignX.value as "left" | "center" | "right") ?? "center",
        (alignY.value as "top" | "middle" | "bottom") ?? "middle",
        alignX.mixed,
        alignY.mixed
      );
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
      els.btnBorderColorEl.value = btn.style.borderColor ?? "#2f2f2f";
      els.btnFgEl.value = btn.style.textColor;
      els.btnBgEl.title = "";
      els.btnBorderColorEl.title = "";
      els.btnFgEl.title = "";
      els.btnFontEl.value = String(btn.style.fontSize);
      els.btnRadiusEl.value = String(btn.style.radius);
      const bgOp = Number(btn.style.bgOpacity ?? 100);
      els.btnBgTransparentEl.classList.toggle("active", bgOp <= 0);
      els.btnBgTransparentEl.setAttribute("aria-pressed", bgOp <= 0 ? "true" : "false");
      els.btnBgTransparentEl.title = "";
      setAlignControls(btn.style.textAlignX ?? "center", btn.style.textAlignY ?? "middle");
      (els.btnLabelVisibilityEl as HTMLInputElement).value = btn.style.labelVisibility ?? "always";
      syncIconClearEnabled(btn);
      const wrapActive = Boolean(btn.style.wrapLabel);
      els.btnWrapEl.classList.toggle("active", wrapActive);
      els.btnWrapEl.setAttribute("aria-pressed", wrapActive ? "true" : "false");
    } else {
      els.btnLabelEl.disabled = false;
      els.btnBgEl.title = "";
      els.btnBorderColorEl.title = "";
      els.btnFgEl.title = "";
      els.btnFontEl.placeholder = "";
      els.btnRadiusEl.placeholder = "";
      els.btnBgTransparentEl.classList.remove("active");
      els.btnBgTransparentEl.setAttribute("aria-pressed", "false");
      els.btnBgTransparentEl.title = "";
      setAlignControls("center", "middle");
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
    els.panelWebSettingsEl.classList.toggle("hidden", state.ui.activeRightTab !== "web");
    const tabStates = [
      { active: state.ui.activeRightTab === "button", tabEl: els.tabButtonSettingsEl, panelEl: els.panelButtonSettingsEl },
      { active: state.ui.activeRightTab === "grid", tabEl: els.tabGridSettingsEl, panelEl: els.panelGridSettingsEl },
      {
        active: state.ui.activeRightTab === "connections",
        tabEl: els.tabConnectionsSettingsEl,
        panelEl: els.panelConnectionsSettingsEl
      },
      {
        active: state.ui.activeRightTab === "web",
        tabEl: els.tabWebSettingsEl,
        panelEl: els.panelWebSettingsEl
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
      "add-delay",
      "btn-label",
      "btn-bg",
      "btn-bg-transparent",
      "btn-border-color",
      "btn-fg",
      "btn-font",
      "btn-align-x-left",
      "btn-align-x-center",
      "btn-align-x-right",
      "btn-align-y-top",
      "btn-align-y-middle",
      "btn-align-y-bottom",
      "btn-radius",
      "btn-icon-pick",
      "btn-icon-clear",
      "service-radius",
      "contact-name",
      "contact-protocol",
      "contact-host",
      "contact-port",
      "contact-new",
      "contact-save",
      "web-server-enabled",
      "web-server-port"
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
