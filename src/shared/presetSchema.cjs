const PRESET_SCHEMA_VERSION = 6;
const MAX_BUTTONS = 100;
const MAX_COMMANDS = 10;
const MAX_CONTACTS = 200;

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function createDefaultPreset() {
  const ts = nowIso();
  return {
    version: PRESET_SCHEMA_VERSION,
    meta: { createdAt: ts, updatedAt: ts },
    ui: {
      alwaysOnTop: true,
      mode: "edit",
      buttonSize: { w: 72, h: 72 },
      grid: { cols: 4, rows: 3 },
      gridBackground: { color: "#000000", opacity: 0.25 },
      service: { col: 0, row: 0, radius: 8, showInGrid: true },
      webServer: { enabled: false, host: "127.0.0.1", port: 3210 },
      clickThroughBackground: true,
      window: { x: 80, y: 80 }
    },
    settings: {
      onCommandError: "stop",
      toastEnabled: true
    },
    contacts: [],
    buttons: []
  };
}

const PRESET_MIGRATIONS = {
  0: (raw) => {
    const ts = nowIso();
    return {
      ...raw,
      version: 1,
      meta: { createdAt: ts, updatedAt: ts }
    };
  },
  1: (raw) => ({
    ...raw,
    version: 2,
    buttons: Array.isArray(raw.buttons)
      ? raw.buttons.map((btn) => ({
          ...btn,
          style: { wrapLabel: false, ...(btn?.style ?? {}) }
        }))
      : []
  }),
  2: (raw) => ({
    ...raw,
    version: 3,
    buttons: Array.isArray(raw.buttons)
      ? raw.buttons.map((btn) => ({
          ...btn,
          style: { iconDarken: 35, labelVisibility: "always", ...(btn?.style ?? {}) }
        }))
      : []
  }),
  // v3 -> v4: introduce asset registry indirection.
  //
  // `iconAssetId` is the content-addressed id returned by the main-process
  // asset registry (qb-asset://). It replaces `iconPath` as the user-facing
  // reference. `iconPath` is kept here on input for backward compatibility:
  // main rehydrates it into the registry on load, then drops the field.
  3: (raw) => ({
    ...raw,
    version: 4,
    buttons: Array.isArray(raw.buttons) ? raw.buttons.map((btn) => ({ ...btn })) : []
  }),
  // v4 -> v5: extend network target options (tcp pooling / retry metadata).
  4: (raw) => ({
    ...raw,
    version: 5,
    contacts: Array.isArray(raw.contacts) ? raw.contacts.map((contact) => ({ ...contact })) : []
  }),
  // v5 -> v6: add web server config block.
  5: (raw) => ({
    ...raw,
    version: 6,
    ui: { ...(raw.ui ?? {}) }
  })
};

function detectPresetVersion(raw) {
  const v = raw?.version;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    if (v === "1.0" || v === "1") return 1;
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

class PresetVersionError extends Error {
  constructor(fileVersion, supportedVersion) {
    super(
      `Preset schema version ${fileVersion} is newer than supported ${supportedVersion}. ` +
        `Update QuickButton to open this file.`
    );
    this.name = "PresetVersionError";
    this.code = "PRESET_VERSION_UNSUPPORTED";
    this.fileVersion = fileVersion;
    this.supportedVersion = supportedVersion;
  }
}

function migratePreset(raw) {
  let current = raw && typeof raw === "object" ? { ...raw } : {};
  let version = detectPresetVersion(current);
  if (version > PRESET_SCHEMA_VERSION) {
    throw new PresetVersionError(version, PRESET_SCHEMA_VERSION);
  }
  while (version < PRESET_SCHEMA_VERSION) {
    const step = PRESET_MIGRATIONS[version];
    if (!step) break;
    current = step(current);
    version = detectPresetVersion(current);
  }
  current.version = PRESET_SCHEMA_VERSION;
  return current;
}

function sanitizeOscArg(rawArg) {
  if (!rawArg || typeof rawArg !== "object") {
    return { type: "string", value: "" };
  }
  if (rawArg.type === "int") {
    return { type: "int", value: Math.trunc(Number(rawArg.value) || 0) };
  }
  if (rawArg.type === "float") {
    return { type: "float", value: Number(rawArg.value) || 0 };
  }
  if (rawArg.type === "bool") {
    return { type: "bool", value: Boolean(rawArg.value) };
  }
  return { type: "string", value: String(rawArg.value ?? "") };
}

function sanitizeCommand(rawCommand) {
  const kind = rawCommand?.kind === "delay" ? "delay" : "command";
  if (kind === "delay") {
    return {
      kind: "delay",
      name: String(rawCommand?.name ?? ""),
      enabled: rawCommand?.enabled !== false,
      isCollapsed: Boolean(rawCommand?.isCollapsed),
      delayMs: clampInt(rawCommand?.delayMs, 0, 120000, 500)
    };
  }
  const protocol = rawCommand?.protocol;
  const contactId = rawCommand?.contactId ? String(rawCommand.contactId) : undefined;
  const name = String(rawCommand?.name ?? "");
  const isCollapsed = Boolean(rawCommand?.isCollapsed);
  const target = {
    host: String(rawCommand?.target?.host ?? "127.0.0.1"),
    port: clampInt(rawCommand?.target?.port, 1, 65535, 7000),
    persistent: Boolean(rawCommand?.target?.persistent),
    keepAliveMs: clampInt(rawCommand?.target?.keepAliveMs, 500, 120000, 10000)
  };

  if (protocol === "osc-udp") {
    const command = {
      kind: "command",
      protocol: "osc-udp",
      name,
      enabled: rawCommand?.enabled !== false,
      isCollapsed,
      osc: {
        address: String(rawCommand?.osc?.address ?? "/ping"),
        args: Array.isArray(rawCommand?.osc?.args) ? rawCommand.osc.args.map(sanitizeOscArg) : []
      }
    };
    if (contactId) command.contactId = contactId;
    else command.target = target;
    return command;
  }

  const normalizedProtocol = protocol === "tcp" ? "tcp" : "udp";
  const command = {
    kind: "command",
    protocol: normalizedProtocol,
    name,
    enabled: rawCommand?.enabled !== false,
    isCollapsed,
    payload: {
      type: rawCommand?.payload?.type === "hex" ? "hex" : "string",
      value: String(rawCommand?.payload?.value ?? "")
    }
  };
  if (rawCommand?.retry && typeof rawCommand.retry === "object") {
    command.retry = {
      count: clampInt(rawCommand.retry.count, 0, 5, 0),
      jitterMs: clampInt(rawCommand.retry.jitterMs, 0, 2000, 0)
    };
  }
  if (contactId) command.contactId = contactId;
  else command.target = target;
  return command;
}

function sanitizeContact(rawContact, index) {
  const protocol =
    rawContact?.protocol === "tcp" ? "tcp" : rawContact?.protocol === "osc-udp" ? "osc-udp" : "udp";
  return {
    id: String(rawContact?.id ?? `contact-${index + 1}`),
    name: String(rawContact?.name ?? `Contact ${index + 1}`),
    protocol,
    target: {
      host: String(rawContact?.target?.host ?? "127.0.0.1"),
      port: clampInt(rawContact?.target?.port, 1, 65535, 7000),
      persistent: Boolean(rawContact?.target?.persistent),
      keepAliveMs: clampInt(rawContact?.target?.keepAliveMs, 500, 120000, 10000)
    }
  };
}

function sanitizePreset(inputPreset) {
  const migrated = migratePreset(inputPreset);
  const preset = migrated && typeof migrated === "object" ? migrated : {};
  const fallback = createDefaultPreset();

  const gridCols = clampInt(preset?.ui?.grid?.cols, 1, 20, fallback.ui.grid.cols);
  const gridRows = clampInt(preset?.ui?.grid?.rows, 1, 20, fallback.ui.grid.rows);
  const serviceCol = clampInt(preset?.ui?.service?.col, 0, gridCols - 1, 0);
  const serviceRow = clampInt(preset?.ui?.service?.row, 0, gridRows - 1, 0);
  const gridBgColorRaw = String(
    preset?.ui?.gridBackground?.color ?? fallback.ui.gridBackground.color
  ).trim();
  const gridBgColor = /^#[0-9a-f]{6}$/i.test(gridBgColorRaw)
    ? gridBgColorRaw
    : fallback.ui.gridBackground.color;
  const gridBgOpacityRaw = Number(preset?.ui?.gridBackground?.opacity);
  const gridBgOpacity = Number.isFinite(gridBgOpacityRaw)
    ? Math.max(0, Math.min(1, gridBgOpacityRaw))
    : fallback.ui.gridBackground.opacity;
  const webServerEnabled = Boolean(preset?.ui?.webServer?.enabled ?? false);
  const webServerPort = clampInt(preset?.ui?.webServer?.port, 1, 65535, 3210);

  const sanitizedButtons = (Array.isArray(preset.buttons) ? preset.buttons : [])
    .slice(0, MAX_BUTTONS)
    .map((button, index) => {
      const id = String(button?.id ?? `btn-${index + 1}`);
      const label = String(button?.label ?? `Btn ${index + 1}`);
      const style = {
        bgColor: String(button?.style?.bgColor ?? "#252525"),
        borderColor: String(button?.style?.borderColor ?? "#2f2f2f"),
        textColor: String(button?.style?.textColor ?? "#ffffff"),
        fontSize: clampInt(button?.style?.fontSize, 8, 42, 13),
        radius: clampInt(button?.style?.radius, 0, 24, 8)
      };
      if (
        typeof button?.style?.iconAssetId === "string" &&
        /^[a-f0-9]{40}$/.test(button.style.iconAssetId)
      ) {
        style.iconAssetId = button.style.iconAssetId;
      }
      if (!style.iconAssetId && button?.style?.iconPath) {
        style.iconPath = String(button.style.iconPath);
      }
      if (button?.style?.wrapLabel) style.wrapLabel = true;
      style.bgOpacity = clampInt(button?.style?.bgOpacity, 0, 100, 100);
      style.iconDarken = clampInt(button?.style?.iconDarken, 0, 100, 35);
      const labelVisibility = button?.style?.labelVisibility;
      style.labelVisibility =
        labelVisibility === "hover" || labelVisibility === "never" ? labelVisibility : "always";
      const textAlignX = button?.style?.textAlignX;
      style.textAlignX =
        textAlignX === "left" || textAlignX === "right" ? textAlignX : "center";
      const textAlignY = button?.style?.textAlignY;
      style.textAlignY = textAlignY === "top" || textAlignY === "bottom" ? textAlignY : "middle";
      return {
        id,
        label,
        style,
        position: {
          col: clampInt(button?.position?.col, 0, gridCols - 1, 0),
          row: clampInt(button?.position?.row, 0, gridRows - 1, 0)
        },
        commands: (Array.isArray(button?.commands) ? button.commands : [])
          .slice(0, MAX_COMMANDS)
          .map(sanitizeCommand)
      };
    });

  const sanitizedContacts = (Array.isArray(preset.contacts) ? preset.contacts : [])
    .slice(0, MAX_CONTACTS)
    .map(sanitizeContact);

  const createdAt = typeof preset?.meta?.createdAt === "string" ? preset.meta.createdAt : nowIso();
  return {
    version: PRESET_SCHEMA_VERSION,
    meta: { createdAt, updatedAt: nowIso() },
    ui: {
      alwaysOnTop: Boolean(preset?.ui?.alwaysOnTop ?? fallback.ui.alwaysOnTop),
      mode: preset?.ui?.mode === "use" ? "use" : "edit",
      buttonSize: {
        w: clampInt(preset?.ui?.buttonSize?.w, 16, 160, fallback.ui.buttonSize.w),
        h: clampInt(preset?.ui?.buttonSize?.h, 16, 160, fallback.ui.buttonSize.h)
      },
      grid: { cols: gridCols, rows: gridRows },
      gridBackground: { color: gridBgColor, opacity: gridBgOpacity },
      service: {
        col: serviceCol,
        row: serviceRow,
        radius: clampInt(preset?.ui?.service?.radius, 0, 24, 8),
        showInGrid: Boolean(preset?.ui?.service?.showInGrid ?? true)
      },
      webServer: {
        enabled: webServerEnabled,
        host: "127.0.0.1",
        port: webServerPort
      },
      clickThroughBackground: Boolean(preset?.ui?.clickThroughBackground ?? true),
      window: {
        x: clampInt(preset?.ui?.window?.x, -4000, 4000, fallback.ui.window.x),
        y: clampInt(preset?.ui?.window?.y, -4000, 4000, fallback.ui.window.y)
      }
    },
    settings: {
      onCommandError: preset?.settings?.onCommandError === "continue" ? "continue" : "stop",
      toastEnabled: Boolean(preset?.settings?.toastEnabled ?? true)
    },
    contacts: sanitizedContacts,
    buttons: sanitizedButtons
  };
}

function validateCommand(command) {
  if (!command || typeof command !== "object") return "Invalid command";
  if (command.kind === "delay") {
    const delayMs = Number(command.delayMs);
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 120000) {
      return "Delay must be in range 0..120000 ms";
    }
    return null;
  }
  if (!command.protocol) return "Protocol is required";
  if (!command.contactId) {
    if (!command.target?.host) return "Host is required";
    if (
      !Number.isInteger(command.target.port) ||
      command.target.port < 1 ||
      command.target.port > 65535
    ) {
      return "Port must be in range 1..65535";
    }
  }
  if (command.protocol === "osc-udp") {
    if (!command.osc?.address) return "OSC address is required";
  } else if (!command.payload?.value) {
    return "Payload value is required";
  }
  return null;
}

module.exports = {
  PRESET_SCHEMA_VERSION,
  MAX_BUTTONS,
  MAX_COMMANDS,
  MAX_CONTACTS,
  PresetVersionError,
  clampInt,
  createDefaultPreset,
  migratePreset,
  detectPresetVersion,
  sanitizeOscArg,
  sanitizeCommand,
  sanitizeContact,
  sanitizePreset,
  validateCommand
};
