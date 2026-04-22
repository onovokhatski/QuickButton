"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/shared/ipc.cjs
var require_ipc = __commonJS({
  "src/shared/ipc.cjs"(exports2, module2) {
    "use strict";
    var CHANNELS2 = Object.freeze({
      presetOpen: "preset:open",
      presetSave: "preset:save",
      presetSaveAs: "preset:saveAs",
      presetLoadLast: "preset:loadLast",
      runtimeTestSend: "runtime:testSend",
      runtimeExecuteChain: "runtime:executeChain",
      webServerGetStatus: "web-server:get-status",
      webServerOpen: "web-server:open",
      webServerRestart: "web-server:restart",
      webServerSyncState: "web-server:sync-state",
      windowMinimize: "window:minimize",
      windowClose: "window:close",
      windowStartDrag: "window:startDrag",
      windowSetAlwaysOnTop: "window:setAlwaysOnTop",
      windowSetContentSize: "window:setContentSize",
      windowSetIgnoreMouseEvents: "window:setIgnoreMouseEvents",
      windowGetCursorInWindow: "window:getCursorInWindow",
      dialogPickIconFile: "dialog:pickIconFile",
      menuSetShowServiceInGrid: "menu:set-show-service-in-grid",
      diagnosticsReportError: "diagnostics:reportError",
      appGetInfo: "app:getInfo"
    });
    var MENU_EVENTS2 = Object.freeze({
      fileOpen: "menu:file-open",
      fileSave: "menu:file-save",
      fileSaveAs: "menu:file-save-as",
      viewEdit: "menu:view-edit",
      viewRun: "menu:view-run",
      viewToggleServiceGrid: "menu:view-toggle-service-grid",
      viewShowShortcuts: "menu:view-show-shortcuts"
    });
    function isObject(value) {
      return value !== null && typeof value === "object";
    }
    var V = {
      object: (shape) => (input) => {
        if (!isObject(input)) return { ok: false, error: "payload must be an object" };
        const out = {};
        for (const key of Object.keys(shape)) {
          const res = shape[key](input[key]);
          if (!res.ok) return { ok: false, error: `${key}: ${res.error}` };
          if (res.value !== void 0) out[key] = res.value;
        }
        return { ok: true, value: out };
      },
      boolean: (opts = {}) => (value) => {
        if (value === void 0) {
          return opts.optional ? { ok: true, value: opts.default } : { ok: false, error: "required" };
        }
        return { ok: true, value: Boolean(value) };
      },
      number: ({ min, max, integer = false, optional = false, default: def } = {}) => (value) => {
        if (value === void 0 || value === null) {
          return optional ? { ok: true, value: def } : { ok: false, error: "required" };
        }
        const n = Number(value);
        if (!Number.isFinite(n)) return { ok: false, error: "must be a number" };
        const finalN = integer ? Math.trunc(n) : n;
        if (min !== void 0 && finalN < min) return { ok: false, error: `must be >= ${min}` };
        if (max !== void 0 && finalN > max) return { ok: false, error: `must be <= ${max}` };
        return { ok: true, value: finalN };
      },
      string: ({ maxLength, optional = false, default: def } = {}) => (value) => {
        if (value === void 0 || value === null) {
          return optional ? { ok: true, value: def } : { ok: false, error: "required" };
        }
        const s = String(value);
        if (maxLength !== void 0 && s.length > maxLength) {
          return { ok: false, error: `must be <= ${maxLength} chars` };
        }
        return { ok: true, value: s };
      },
      enumOf: (values, { optional = false, default: def } = {}) => (value) => {
        if (value === void 0) {
          return optional ? { ok: true, value: def } : { ok: false, error: "required" };
        }
        if (!values.includes(value)) {
          return { ok: false, error: `must be one of ${values.join(", ")}` };
        }
        return { ok: true, value };
      },
      array: ({ optional = false, default: def, maxLength } = {}) => (value) => {
        if (value === void 0 || value === null) {
          return optional ? { ok: true, value: def } : { ok: false, error: "required" };
        }
        if (!Array.isArray(value)) {
          return { ok: false, error: "must be an array" };
        }
        if (typeof maxLength === "number" && value.length > maxLength) {
          return { ok: false, error: `must contain <= ${maxLength} items` };
        }
        return { ok: true, value };
      },
      any: () => (value) => ({ ok: true, value })
    };
    var SCHEMAS = Object.freeze({
      [CHANNELS2.windowSetAlwaysOnTop]: V.object({ value: V.boolean() }),
      [CHANNELS2.windowSetContentSize]: V.object({
        width: V.number({ min: 120, max: 3200, integer: true }),
        height: V.number({ min: 120, max: 3200, integer: true })
      }),
      [CHANNELS2.windowSetIgnoreMouseEvents]: V.object({
        ignore: V.boolean(),
        forward: V.boolean({ optional: true, default: false })
      }),
      [CHANNELS2.dialogPickIconFile]: V.object({
        currentPath: V.string({ maxLength: 1024, optional: true, default: "" })
      }),
      [CHANNELS2.menuSetShowServiceInGrid]: V.object({ value: V.boolean() }),
      [CHANNELS2.runtimeExecuteChain]: V.object({
        buttonId: V.string({ maxLength: 120, optional: true, default: "" }),
        chain: V.array({ maxLength: 50 }),
        onError: V.enumOf(["stop", "continue"], { optional: true, default: "stop" })
      }),
      [CHANNELS2.webServerOpen]: V.object({
        url: V.string({ maxLength: 1024 })
      }),
      [CHANNELS2.webServerRestart]: V.object({
        preset: V.any()
      }),
      [CHANNELS2.webServerSyncState]: V.object({
        preset: V.any()
      }),
      [CHANNELS2.diagnosticsReportError]: V.object({
        sessionId: V.string({ maxLength: 64, optional: true, default: "" }),
        kind: V.enumOf(["error", "unhandledrejection"], { optional: true, default: "error" }),
        message: V.string({ maxLength: 2e3, optional: true, default: "" }),
        name: V.string({ maxLength: 200, optional: true, default: "" }),
        stack: V.string({ maxLength: 8e3, optional: true, default: "" }),
        source: V.string({ maxLength: 500, optional: true, default: "" }),
        lineno: V.number({ optional: true, default: 0 }),
        colno: V.number({ optional: true, default: 0 })
      })
    });
    function validatePayload(channel, payload) {
      const schema = SCHEMAS[channel];
      if (!schema) return { ok: true, value: payload };
      return schema(payload);
    }
    module2.exports = {
      CHANNELS: CHANNELS2,
      MENU_EVENTS: MENU_EVENTS2,
      SCHEMAS,
      validatePayload,
      V
    };
  }
});

// electron/preload.source.cjs
var { contextBridge, ipcRenderer } = require("electron");
var { CHANNELS, MENU_EVENTS } = require_ipc();
var api = {
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
  webServer: {
    getStatus: () => ipcRenderer.invoke(CHANNELS.webServerGetStatus),
    open: (payload) => ipcRenderer.invoke(CHANNELS.webServerOpen, payload),
    restart: (payload) => ipcRenderer.invoke(CHANNELS.webServerRestart, payload),
    syncState: (payload) => ipcRenderer.invoke(CHANNELS.webServerSyncState, payload)
  },
  window: {
    minimize: () => ipcRenderer.invoke(CHANNELS.windowMinimize),
    close: () => ipcRenderer.invoke(CHANNELS.windowClose),
    startDrag: () => ipcRenderer.invoke(CHANNELS.windowStartDrag),
    setAlwaysOnTop: (payload) => ipcRenderer.invoke(CHANNELS.windowSetAlwaysOnTop, payload),
    setContentSize: (payload) => ipcRenderer.invoke(CHANNELS.windowSetContentSize, payload),
    setIgnoreMouseEvents: (payload) => ipcRenderer.invoke(CHANNELS.windowSetIgnoreMouseEvents, payload),
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
      ipcRenderer.on(
        MENU_EVENTS.viewToggleServiceGrid,
        (_event, payload) => handler("viewToggleServiceGrid", payload)
      );
      ipcRenderer.on(MENU_EVENTS.viewShowShortcuts, () => handler("viewShowShortcuts"));
    },
    setShowServiceInGrid: (payload) => ipcRenderer.invoke(CHANNELS.menuSetShowServiceInGrid, payload)
  }
};
contextBridge.exposeInMainWorld("quickButtonApi", api);
