const { contextBridge, ipcRenderer } = require("electron");
const { CHANNELS, MENU_EVENTS } = require("../src/shared/ipc.cjs");

const api = {
  preset: {
    open: () => ipcRenderer.invoke(CHANNELS.presetOpen),
    save: (payload) => ipcRenderer.invoke(CHANNELS.presetSave, payload),
    saveAs: (payload) => ipcRenderer.invoke(CHANNELS.presetSaveAs, payload),
    loadLast: () => ipcRenderer.invoke(CHANNELS.presetLoadLast)
  },
  runtime: {
    testSend: (payload) => ipcRenderer.invoke(CHANNELS.runtimeTestSend, payload),
    executeChain: (payload) => ipcRenderer.invoke(CHANNELS.runtimeExecuteChain, payload)
  },
  window: {
    minimize: () => ipcRenderer.invoke(CHANNELS.windowMinimize),
    close: () => ipcRenderer.invoke(CHANNELS.windowClose),
    startDrag: () => ipcRenderer.invoke(CHANNELS.windowStartDrag),
    setAlwaysOnTop: (payload) => ipcRenderer.invoke(CHANNELS.windowSetAlwaysOnTop, payload),
    setContentSize: (payload) => ipcRenderer.invoke(CHANNELS.windowSetContentSize, payload),
    setIgnoreMouseEvents: (payload) =>
      ipcRenderer.invoke(CHANNELS.windowSetIgnoreMouseEvents, payload),
    getCursorInWindow: () => ipcRenderer.invoke(CHANNELS.windowGetCursorInWindow)
  },
  dialog: {
    pickIconFile: (payload) => ipcRenderer.invoke(CHANNELS.dialogPickIconFile, payload)
  },
  diagnostics: {
    reportError: (payload) => ipcRenderer.invoke(CHANNELS.diagnosticsReportError, payload)
  },
  app: {
    getInfo: () => ipcRenderer.invoke(CHANNELS.appGetInfo)
  },
  menu: {
    onAction: (handler) => {
      ipcRenderer.on(MENU_EVENTS.fileOpen, () => handler("open"));
      ipcRenderer.on(MENU_EVENTS.fileSave, () => handler("save"));
      ipcRenderer.on(MENU_EVENTS.fileSaveAs, () => handler("saveAs"));
      ipcRenderer.on(MENU_EVENTS.viewEdit, () => handler("viewEdit"));
      ipcRenderer.on(MENU_EVENTS.viewRun, () => handler("viewRun"));
      ipcRenderer.on(MENU_EVENTS.viewToggleServiceGrid, (_event, payload) =>
        handler("viewToggleServiceGrid", payload)
      );
      ipcRenderer.on(MENU_EVENTS.viewShowShortcuts, () => handler("viewShowShortcuts"));
    },
    setShowServiceInGrid: (payload) =>
      ipcRenderer.invoke(CHANNELS.menuSetShowServiceInGrid, payload)
  }
};

contextBridge.exposeInMainWorld("quickButtonApi", api);
