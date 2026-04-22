import { createRendererState, createRendererStore } from "../state/store";
import { createConnectionsController } from "./connections";
import { createEditorController } from "./editor";
import { createEventsController } from "./events";
import { createGridController } from "./grid";
import { applyAppCommand, deriveCommandHistoryDelta } from "./appCommands";
import { createHistoryController } from "./history";
import { createInteractionController } from "./interaction";
import { installRendererDiagnostics } from "./diagnostics";
import { getDomRefs } from "./domRefs";
import { defaultPreset, nowId } from "./model";
import { setupOnboarding } from "./onboarding";
import { createPresetController } from "./preset";
import { createRenderController } from "./render";
import { createRunnerController } from "./runner";
import { setupShortcuts } from "./shortcuts";
import { createServiceController } from "./service";
import { createStartupController } from "./startup";
import { createWindowSizingController } from "./windowSizing";
import { createAutoSaveController } from "./autosave";

const MAX_BUTTONS = 100;
const MAX_COMMANDS = 10;

const {
  statusEl,
  presetPathEl,
  appVersionEl,
  toastRoot,
  gridEl,
  commandsEl,
  topServiceSlotEl,
  shellEl,
  noSelectionEl,
  editorFieldsEl,
  serviceEditorEl,
  gridColsEl,
  gridRowsEl,
  btnSizeWEl,
  btnSizeHEl,
  onErrorEl,
  alwaysOnTopEl,
  clickThroughBackgroundEl,
  showServiceInGridEl,
  gridBgColorEl,
  gridBgOpacityEl,
  gridBgOpacityValueEl,
  btnLabelEl,
  btnBgEl,
  btnBgTransparentEl,
  btnBorderColorEl,
  btnFgEl,
  btnFontEl,
  btnAlignXLeftEl,
  btnAlignXCenterEl,
  btnAlignXRightEl,
  btnAlignYTopEl,
  btnAlignYMiddleEl,
  btnAlignYBottomEl,
  btnWrapEl,
  btnRadiusEl,
  btnIconPickEl,
  btnIconClearEl,
  btnLabelVisibilityEl,
  btnPreviewEl,
  serviceRadiusEl,
  tabButtonSettingsEl,
  tabGridSettingsEl,
  tabConnectionsSettingsEl,
  panelButtonSettingsEl,
  panelGridSettingsEl,
  panelConnectionsSettingsEl,
  contactNameEl,
  contactProtocolEl,
  contactHostEl,
  contactPortEl,
  contactNewEl,
  contactSaveEl,
  contactsListEl
} = getDomRefs();

let presetPath = null;
let appInfo = { version: "", gitHash: "", isPackaged: true, sessionId: "" };
let shortcutsController = null;
let connectionsController = null;
let serviceController = null;
let gridController = null;
let editorController = null;
let presetController = null;
let eventsController = null;
let startupController = null;
let interactionController = null;
let renderController = null;
let runnerController = null;
let windowSizingController = null;
let historyController = null;
let autoSaveController = null;

const state = createRendererState();
const store = createRendererStore(state);

function markDirty() {
  state.ui.isDirty = true;
}

function markClean() {
  state.ui.isDirty = false;
  ensureHistoryController().reset();
}

/** Plan-3 A1: все мутации preset через команды (постепенный перенос). */
function dispatch(command, options) {
  if (!state.preset && command.type !== "preset.replace") return;
  const uiBefore = {
    selectedButtonId: state.ui.selectedButtonId,
    selectedTarget: state.ui.selectedTarget,
    selectedButtonIds: Array.isArray(state.ui.selectedButtonIds) ? [...state.ui.selectedButtonIds] : [],
    selectedContactId: state.ui.selectedContactId ?? null,
    activeRightTab: state.ui.activeRightTab
  };
  const delta = deriveCommandHistoryDelta(state, command);
  applyAppCommand(state, command);
  const opts = options || {};
  if (opts.skipMarkDirty !== true) {
    markDirty();
    if (delta) {
      const uiAfter = {
        selectedButtonId: state.ui.selectedButtonId,
        selectedTarget: state.ui.selectedTarget,
        selectedButtonIds: Array.isArray(state.ui.selectedButtonIds) ? [...state.ui.selectedButtonIds] : [],
        selectedContactId: state.ui.selectedContactId ?? null,
        activeRightTab: state.ui.activeRightTab
      };
      ensureHistoryController().record({
        forward: delta.forward,
        backward: delta.backward,
        uiBefore,
        uiAfter
      }, { groupKey: opts.historyGroup });
    }
  }
  if (opts.render !== false) {
    render();
  }
  if (command.type === "preset.setMode" || command.type === "preset.toggleMode") {
    void ensureAutoSaveController().trigger("mode-switch", { force: true, silent: true });
  }
}

function canEdit() {
  return state.preset?.ui?.mode === "edit";
}

function confirmDiscardChanges() {
  if (!state.ui.isDirty) return true;
  return window.confirm("You have unsaved changes. Continue and discard them?");
}

function defaultCommand(commandName = "") {
  const firstContact = contacts()[0];
  return {
    kind: "command",
    name: commandName,
    enabled: true,
    isCollapsed: false,
    contactId: firstContact?.id ?? "",
    payload: { type: "string", value: "PING" }
  };
}

function defaultDelayCommand(commandName = "") {
  return {
    kind: "delay",
    name: commandName,
    enabled: true,
    isCollapsed: false,
    delayMs: 500
  };
}

function showToast(message, type = "error") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastRoot.appendChild(el);
  window.setTimeout(() => {
    el.remove();
  }, 2600);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function updateVersionBadge() {
  if (!appVersionEl) return;
  const version = appInfo?.version ? `v${appInfo.version}` : "v?";
  const hash = !appInfo?.isPackaged && appInfo?.gitHash ? `-${appInfo.gitHash}` : "";
  appVersionEl.textContent = `${version}${hash}`;
  if (appInfo?.sessionId) {
    appVersionEl.title = `Session ${appInfo.sessionId}`;
  }
}

function selectedButton() {
  return state.preset.buttons.find((btn) => btn.id === state.ui.selectedButtonId) ?? null;
}

function selectedButtons() {
  if (!state.preset) return [];
  if (!Array.isArray(state.ui.selectedButtonIds) || state.ui.selectedButtonIds.length === 0) {
    const btn = selectedButton();
    return btn ? [btn] : [];
  }
  const selectedIds = new Set(state.ui.selectedButtonIds);
  return state.preset.buttons.filter((btn) => selectedIds.has(btn.id));
}

function ensureConnectionsController() {
  if (connectionsController) return connectionsController;
  connectionsController = createConnectionsController({
    state,
    canEdit,
    dispatch,
    render,
    showToast,
    nowId,
    form: {
      contactNameEl,
      contactProtocolEl,
      contactHostEl,
      contactPortEl,
      contactNewEl,
      contactSaveEl,
      contactsListEl
    }
  });
  return connectionsController;
}

function ensureServiceController() {
  if (serviceController) return serviceController;
  serviceController = createServiceController({
    state,
    canEdit,
    dispatch,
    render,
    setStatus,
    showToast,
    confirmDiscardChanges,
    getButtonAtCell,
    onMinimizeWindow: () => window.quickButtonApi.window.minimize(),
    onCloseWindow: () => {
      void ensureAutoSaveController()
        .trigger("window-close", { force: true, silent: true })
        .finally(() => {
          window.quickButtonApi.window.close();
        });
    }
  });
  return serviceController;
}

function ensureGridController() {
  if (gridController) return gridController;
  gridController = createGridController({
    state,
    gridEl,
    topServiceSlotEl,
    canEdit,
    dispatch,
    render,
    runButton,
    showToast,
    nowId,
    defaultCommand,
    MAX_BUTTONS,
    getButtonAtCell,
    isServiceCell,
    serviceConfig,
    ensureServiceCellVacant,
    serviceCellElement,
    serviceTopBarElement,
    gridBackgroundConfig,
    applyButtonStyleToElement,
    applyEditorFromSelection
  });
  return gridController;
}

function ensureEditorController() {
  if (editorController) return editorController;
  editorController = createEditorController({
    state,
    commandsEl,
    canEdit,
    selectedButton,
    contacts,
    getContactById,
    validateCommand,
    resolveCommandForSend,
    dispatch,
    renderEditorSelection: applyEditorFromSelection,
    showToast,
    runtimeTestSend: (payload) => window.quickButtonApi.runtime.testSend(payload)
  });
  return editorController;
}

function ensurePresetController() {
  if (presetController) return presetController;
  presetController = createPresetController({
    state,
    getPresetPath: () => presetPath,
    setPresetPath: (path) => {
      presetPath = path;
    },
    confirmDiscardChanges,
    dispatch,
    markClean,
    syncControlsFromPreset,
    render,
    setStatus,
    showToast,
    openPreset: () => window.quickButtonApi.preset.open(),
    savePreset: (input) => window.quickButtonApi.preset.save(input),
    saveAsPreset: (input) => window.quickButtonApi.preset.saveAs(input)
  });
  return presetController;
}

function ensureInteractionController() {
  if (interactionController) return interactionController;
  interactionController = createInteractionController({
    canEdit,
    clickThroughBackgroundEnabled,
    setIgnoreMouseEvents: (payload) => window.quickButtonApi.window.setIgnoreMouseEvents(payload),
    getCursorInWindow: () => window.quickButtonApi.window.getCursorInWindow()
  });
  return interactionController;
}

function ensureWindowSizingController() {
  if (windowSizingController) return windowSizingController;
  windowSizingController = createWindowSizingController({
    shellEl,
    setContentSize: (payload) => window.quickButtonApi.window.setContentSize(payload)
  });
  return windowSizingController;
}

function scheduleWindowResize() {
  ensureWindowSizingController().scheduleWindowResize();
}

function ensureRenderController() {
  if (renderController) return renderController;
  renderController = createRenderController({
    state,
    getPresetPath: () => presetPath,
    canEdit,
    selectedButton,
    selectedButtons,
    serviceConfig,
    syncCursorPollFromState,
    scheduleWindowResize,
    renderGrid,
    renderEditor,
    renderConnectionsPanel,
    els: {
      presetPathEl,
      panelButtonSettingsEl,
      panelGridSettingsEl,
      panelConnectionsSettingsEl,
      tabButtonSettingsEl,
      tabGridSettingsEl,
      tabConnectionsSettingsEl,
      gridColsEl,
      gridRowsEl,
      btnSizeWEl,
      btnSizeHEl,
      onErrorEl,
      alwaysOnTopEl,
      clickThroughBackgroundEl,
      showServiceInGridEl,
      gridBgColorEl,
      gridBgOpacityEl,
      gridBgOpacityValueEl,
      btnLabelEl,
      btnBgEl,
      btnBgTransparentEl,
      btnBorderColorEl,
      btnFgEl,
      btnFontEl,
      btnAlignXLeftEl,
      btnAlignXCenterEl,
      btnAlignXRightEl,
      btnAlignYTopEl,
      btnAlignYMiddleEl,
      btnAlignYBottomEl,
      btnWrapEl,
      btnRadiusEl,
      btnIconClearEl,
      btnLabelVisibilityEl,
      btnPreviewEl,
      noSelectionEl,
      editorFieldsEl,
      serviceEditorEl,
      serviceRadiusEl
    }
  });
  return renderController;
}

function ensureRunnerController() {
  if (runnerController) return runnerController;
  runnerController = createRunnerController({
    state,
    gridEl,
    getContactById,
    resolveCommandForSend,
    setStatus,
    showToast,
    executeChain: (payload) => window.quickButtonApi.runtime.executeChain(payload)
  });
  return runnerController;
}

function ensureHistoryController() {
  if (historyController) return historyController;
  historyController = createHistoryController({
    state,
    render
  });
  return historyController;
}

function ensureAutoSaveController() {
  if (autoSaveController) return autoSaveController;
  autoSaveController = createAutoSaveController({
    state,
    getPresetPath: () => presetPath,
    setPresetPath: (path) => {
      presetPath = path;
    },
    savePreset: (input) => window.quickButtonApi.preset.save(input),
    render,
    setStatus,
    showToast,
    intervalMs: 30000
  });
  return autoSaveController;
}

function ensureEventsController() {
  if (eventsController) return eventsController;
  eventsController = createEventsController({
    state,
    canEdit,
    dispatch,
    render,
    setStatus,
    showToast,
    nowId,
    defaultCommand,
    defaultDelayCommand,
    selectedButton,
    selectedButtons,
    runButton,
    getButtonAtCell,
    isServiceCell,
    updateClickThroughFromPointer: (event) =>
      ensureInteractionController().updateClickThroughFromPointer(event),
    setWindowIgnoreMouseEvents: (ignore) =>
      ensureInteractionController().setWindowIgnoreMouseEvents(ignore),
    handleServiceAction: (action, source) =>
      ensureServiceController().handleServiceAction(action, source),
    bindConnectionsEvents: () => ensureConnectionsController().bindConnectionsEvents(),
    handleMenuPresetAction: (action) => ensurePresetController().handleMenuPresetAction(action),
    toggleShortcutsOverlay: () => shortcutsController?.toggleOverlay(true),
    setupShortcuts: () => {
      shortcutsController = setupShortcuts({
        state,
        canEdit,
        dispatch,
        undo: () => ensureHistoryController().undo(),
        redo: () => ensureHistoryController().redo(),
        setStatus,
        runButton
      });
    },
    setupOnboarding: () => setupOnboarding(),
    MAX_BUTTONS,
    MAX_COMMANDS,
    els: {
      tabButtonSettingsEl,
      tabGridSettingsEl,
      tabConnectionsSettingsEl,
      alwaysOnTopEl,
      gridColsEl,
      gridRowsEl,
      btnSizeWEl,
      btnSizeHEl,
      onErrorEl,
      clickThroughBackgroundEl,
      showServiceInGridEl,
      gridBgColorEl,
      gridBgOpacityEl,
      gridBgOpacityValueEl,
      btnLabelEl,
      btnBgEl,
      btnBgTransparentEl,
      btnBorderColorEl,
      btnFgEl,
      btnFontEl,
      btnAlignXLeftEl,
      btnAlignXCenterEl,
      btnAlignXRightEl,
      btnAlignYTopEl,
      btnAlignYMiddleEl,
      btnAlignYBottomEl,
      btnWrapEl,
      btnRadiusEl,
      btnIconPickEl,
      btnIconClearEl,
      btnLabelVisibilityEl,
      serviceRadiusEl
    }
  });
  return eventsController;
}

function setupShellResizeObserver() {
  ensureWindowSizingController().setupShellResizeObserver();
}

function ensureStartupController() {
  if (startupController) return startupController;
  startupController = createStartupController({
    state,
    defaultPreset,
    dispatch,
    setPresetPath: (path) => {
      presetPath = path;
    },
    setAppInfo: (value) => {
      appInfo = value;
    },
    getAppInfo: () => appInfo,
    loadLastPreset: () => window.quickButtonApi.preset.loadLast(),
    fetchAppInfo: () => window.quickButtonApi.app.getInfo(),
    updateVersionBadge,
    showToast,
    markClean,
    syncControlsFromPreset,
    bindEvents,
    subscribeRender: () => store.subscribe(render),
    setupShellResizeObserver,
    render,
    setStatus,
    setWindowAlwaysOnTop: (value) => window.quickButtonApi.window.setAlwaysOnTop({ value }),
    setWindowIgnoreMouseEvents: (ignore) =>
      ensureInteractionController().setWindowIgnoreMouseEvents(ignore)
  });
  return startupController;
}

function contacts() {
  return ensureConnectionsController().contacts();
}

function getContactById(contactId) {
  return ensureConnectionsController().getContactById(contactId);
}

function resolveCommandForSend(command) {
  return ensureConnectionsController().resolveCommandForSend(command);
}

function serviceConfig() {
  return ensureServiceController().serviceConfig();
}

function clickThroughBackgroundEnabled() {
  return ensureRenderController().clickThroughBackgroundEnabled();
}

function gridBackgroundConfig() {
  return ensureRenderController().gridBackgroundConfig();
}

function validateCommand(command) {
  return ensureRunnerController().validateCommand(command);
}

function syncControlsFromPreset() {
  ensureRenderController().syncControlsFromPreset();
}

function applyButtonStyleToElement(uiEl, btn) {
  ensureRenderController().applyButtonStyleToElement(uiEl, btn);
}

function applyEditorFromSelection() {
  ensureRenderController().applyEditorFromSelection();
}

function getButtonAtCell(col, row) {
  return (
    state.preset.buttons.find((btn) => btn.position.col === col && btn.position.row === row) ?? null
  );
}

function isServiceCell(col, row) {
  return ensureServiceController().isServiceCell(col, row);
}

function serviceCellElement(compact, source = "grid", inactive = false) {
  return ensureServiceController().serviceCellElement(compact, source, inactive);
}

function serviceTopBarElement() {
  return ensureServiceController().serviceTopBarElement();
}

function ensureServiceCellVacant() {
  ensureServiceController().ensureServiceCellVacant();
}

function renderGrid() {
  ensureGridController().renderGrid();
}

function renderEditor() {
  ensureEditorController().renderEditor();
}

function renderConnectionsPanel() {
  ensureConnectionsController().renderConnectionsPanel();
}

async function runButton(btn) {
  await ensureRunnerController().runButton(btn);
}

function render() {
  ensureRenderController().render();
}

function syncCursorPollFromState() {
  ensureInteractionController().syncCursorPollFromState();
}

function bindEvents() {
  ensureEventsController().bindEvents();
}

async function init() {
  await ensureStartupController().init();
  ensureAutoSaveController().start();
}

installRendererDiagnostics({
  reportError: (payload) => {
    try {
      const enriched = {
        ...payload,
        sessionId: appInfo?.sessionId ? String(appInfo.sessionId) : ""
      };
      window.quickButtonApi?.diagnostics?.reportError?.(enriched)?.catch?.(() => {});
    } catch {
      // swallow — we're already in an error path
    }
  }
});

let appStarted = false;

export function startLegacyApp() {
  if (appStarted) return;
  appStarted = true;
  init();
}
