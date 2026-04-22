const CHANNELS = Object.freeze({
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

const MENU_EVENTS = Object.freeze({
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

const V = {
  object: (shape) => (input) => {
    if (!isObject(input)) return { ok: false, error: "payload must be an object" };
    const out = {};
    for (const key of Object.keys(shape)) {
      const res = shape[key](input[key]);
      if (!res.ok) return { ok: false, error: `${key}: ${res.error}` };
      if (res.value !== undefined) out[key] = res.value;
    }
    return { ok: true, value: out };
  },
  boolean:
    (opts = {}) =>
    (value) => {
      if (value === undefined) {
        return opts.optional ? { ok: true, value: opts.default } : { ok: false, error: "required" };
      }
      return { ok: true, value: Boolean(value) };
    },
  number:
    ({ min, max, integer = false, optional = false, default: def } = {}) =>
    (value) => {
      if (value === undefined || value === null) {
        return optional ? { ok: true, value: def } : { ok: false, error: "required" };
      }
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: "must be a number" };
      const finalN = integer ? Math.trunc(n) : n;
      if (min !== undefined && finalN < min) return { ok: false, error: `must be >= ${min}` };
      if (max !== undefined && finalN > max) return { ok: false, error: `must be <= ${max}` };
      return { ok: true, value: finalN };
    },
  string:
    ({ maxLength, optional = false, default: def } = {}) =>
    (value) => {
      if (value === undefined || value === null) {
        return optional ? { ok: true, value: def } : { ok: false, error: "required" };
      }
      const s = String(value);
      if (maxLength !== undefined && s.length > maxLength) {
        return { ok: false, error: `must be <= ${maxLength} chars` };
      }
      return { ok: true, value: s };
    },
  enumOf:
    (values, { optional = false, default: def } = {}) =>
    (value) => {
      if (value === undefined) {
        return optional ? { ok: true, value: def } : { ok: false, error: "required" };
      }
      if (!values.includes(value)) {
        return { ok: false, error: `must be one of ${values.join(", ")}` };
      }
      return { ok: true, value };
    },
  array:
    ({ optional = false, default: def, maxLength } = {}) =>
    (value) => {
      if (value === undefined || value === null) {
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

const SCHEMAS = Object.freeze({
  [CHANNELS.windowSetAlwaysOnTop]: V.object({ value: V.boolean() }),
  [CHANNELS.windowSetContentSize]: V.object({
    width: V.number({ min: 120, max: 3200, integer: true }),
    height: V.number({ min: 120, max: 3200, integer: true })
  }),
  [CHANNELS.windowSetIgnoreMouseEvents]: V.object({
    ignore: V.boolean(),
    forward: V.boolean({ optional: true, default: false })
  }),
  [CHANNELS.dialogPickIconFile]: V.object({
    currentPath: V.string({ maxLength: 1024, optional: true, default: "" })
  }),
  [CHANNELS.menuSetShowServiceInGrid]: V.object({ value: V.boolean() }),
  [CHANNELS.runtimeExecuteChain]: V.object({
    buttonId: V.string({ maxLength: 120, optional: true, default: "" }),
    chain: V.array({ maxLength: 50 }),
    onError: V.enumOf(["stop", "continue"], { optional: true, default: "stop" })
  }),
  [CHANNELS.webServerOpen]: V.object({
    url: V.string({ maxLength: 1024 })
  }),
  [CHANNELS.webServerRestart]: V.object({
    preset: V.any()
  }),
  [CHANNELS.webServerSyncState]: V.object({
    preset: V.any()
  }),
  [CHANNELS.diagnosticsReportError]: V.object({
    sessionId: V.string({ maxLength: 64, optional: true, default: "" }),
    kind: V.enumOf(["error", "unhandledrejection"], { optional: true, default: "error" }),
    message: V.string({ maxLength: 2000, optional: true, default: "" }),
    name: V.string({ maxLength: 200, optional: true, default: "" }),
    stack: V.string({ maxLength: 8000, optional: true, default: "" }),
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

module.exports = {
  CHANNELS,
  MENU_EVENTS,
  SCHEMAS,
  validatePayload,
  V
};
