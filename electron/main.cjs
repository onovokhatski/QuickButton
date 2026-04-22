const path = require("node:path");
const fs = require("node:fs/promises");
const dgram = require("node:dgram");
const net = require("node:net");
const http = require("node:http");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  nativeImage,
  net: electronNet,
  protocol,
  screen,
  session,
  shell,
  clipboard
} = require("electron");
const { pathToFileURL } = require("node:url");
const log = require("./logger.cjs");
const presetSchema = require("../src/shared/presetSchema.cjs");
const ipcShared = require("../src/shared/ipc.cjs");
const assetRegistry = require("./assetRegistry.cjs");
const { encodeOscPacket } = require("../src/shared/oscCodec.cjs");
const { runWithRetry, normalizeRetryOptions } = require("../src/shared/networkRetry.cjs");
const { MAX_COMMANDS, createDefaultPreset, sanitizePreset } = presetSchema;
let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null;
}

function defineIpc(channel, handler) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, payload) => {
    const validation = ipcShared.validatePayload(channel, payload);
    if (!validation.ok) {
      log.warn(`IPC[${channel}] invalid payload:`, validation.error);
      throw new Error(`Invalid IPC payload for ${channel}: ${validation.error}`);
    }
    return handler(event, validation.value);
  });
}

const { CHANNELS: channels, MENU_EVENTS: menuEvents } = ipcShared;

let mainWindow = null;
const APP_NAME = "QuickButton";
const APP_ICON_PATH = path.join(__dirname, "../build/icon.png");
const SESSION_ID = randomUUID();
const MAX_PRESET_FILE_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_PAYLOAD_BYTES = 64 * 1024;
const RELEASES_URL =
  process.env.QB_RELEASES_URL || "https://github.com/olegnovokhatskyi/QuickButton/releases";
const runtimeStats = {
  testSend: { total: 0, ok: 0, failed: 0 },
  chain: {
    total: 0,
    ok: 0,
    failed: 0,
    stepsTotal: 0,
    stepsOk: 0,
    stepsFailed: 0
  }
};
let webPresetState = createDefaultPreset();
let webServerInstance = null;
let webServerStatus = {
  enabled: false,
  running: false,
  host: "127.0.0.1",
  port: 3210,
  url: "http://127.0.0.1:3210",
  error: ""
};
const WEB_RUN_RATE_LIMIT_MS = 200;
const webRunRateLimit = new Map();

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function assertPayloadSize(buffer, context = "Payload") {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error(`${context} is invalid`);
  }
  if (buffer.length > MAX_COMMAND_PAYLOAD_BYTES) {
    throw new Error(
      `${context} exceeds ${formatBytes(MAX_COMMAND_PAYLOAD_BYTES)} (got ${formatBytes(buffer.length)})`
    );
  }
}

function assertPresetFileSize(byteLength, location = "Preset file") {
  if (!Number.isFinite(byteLength)) return;
  if (byteLength > MAX_PRESET_FILE_BYTES) {
    throw new Error(
      `${location} exceeds ${formatBytes(MAX_PRESET_FILE_BYTES)} (got ${formatBytes(byteLength)})`
    );
  }
}

function createAppIcon() {
  const fromPath = nativeImage.createFromPath(APP_ICON_PATH);
  if (!fromPath.isEmpty()) {
    return fromPath;
  }
  return nativeImage.createEmpty();
}

function normalizeHexInput(input) {
  const compact = input
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.replace(/^0x/i, ""))
    .join("");

  if (!compact) return Buffer.alloc(0);
  if (compact.length % 2 !== 0 || /[^0-9a-f]/i.test(compact)) {
    throw new Error("Invalid hex payload");
  }
  return Buffer.from(compact, "hex");
}

function commandToBuffer(command) {
  if (!command?.payload?.value) {
    throw new Error("Payload is required");
  }
  const payload = command.payload.type === "hex"
    ? normalizeHexInput(command.payload.value)
    : Buffer.from(command.payload.value, "utf8");
  assertPayloadSize(payload);
  return payload;
}

function validateTarget(target) {
  if (!target?.host || typeof target.host !== "string") {
    throw new Error("Host is required");
  }
  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
    throw new Error("Port must be in range 1..65535");
  }
}

const DEFAULT_UDP_TIMEOUT_MS = 2000;
const DEFAULT_TCP_CONNECT_TIMEOUT_MS = 2000;
const DEFAULT_TCP_WRITE_TIMEOUT_MS = 2000;
const DEFAULT_TCP_KEEP_ALIVE_MS = 10000;

class SendError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SendError";
    this.code = code;
  }
}

function sendUdp(host, port, payload, { timeoutMs = DEFAULT_UDP_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new SendError("EINVAL", "UDP host is required"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return reject(new SendError("EINVAL", "UDP port must be in range 1..65535"));
    }
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {}
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => {
      finish(new SendError("ETIMEDOUT", `UDP send timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once("error", (error) => {
      finish(new SendError(error?.code ?? "EUDP", error?.message ?? "UDP error"));
    });
    try {
      socket.send(payload, port, host, (error) => {
        if (error) {
          finish(new SendError(error?.code ?? "EUDP", error?.message ?? "UDP send failed"));
        } else {
          finish(null);
        }
      });
    } catch (error) {
      finish(new SendError(error?.code ?? "EUDP", error?.message ?? "UDP send threw"));
    }
  });
}

function sendTcp(
  host,
  port,
  payload,
  {
    connectTimeoutMs = DEFAULT_TCP_CONNECT_TIMEOUT_MS,
    writeTimeoutMs = DEFAULT_TCP_WRITE_TIMEOUT_MS
  } = {}
) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new SendError("EINVAL", "TCP host is required"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return reject(new SendError("EINVAL", "TCP port must be in range 1..65535"));
    }

    const socket = new net.Socket();
    let settled = false;
    const connectTimer = setTimeout(() => {
      finish(new SendError("ETIMEDOUT", `TCP connect timed out after ${connectTimeoutMs}ms`));
    }, connectTimeoutMs);

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      try {
        socket.destroy();
      } catch {}
      err ? reject(err) : resolve();
    };

    socket.once("error", (error) => {
      finish(new SendError(error?.code ?? "ETCP", error?.message ?? "TCP error"));
    });

    socket.connect(port, host, () => {
      clearTimeout(connectTimer);
      const writeTimer = setTimeout(() => {
        finish(new SendError("ETIMEDOUT", `TCP write timed out after ${writeTimeoutMs}ms`));
      }, writeTimeoutMs);
      socket.write(payload, (error) => {
        clearTimeout(writeTimer);
        if (error) {
          finish(new SendError(error?.code ?? "ETCP", error?.message ?? "TCP write failed"));
          return;
        }
        try {
          socket.end();
        } catch {}
        finish(null);
      });
    });
  });
}

const tcpPool = new Map();

function tcpPoolKey(host, port) {
  return `${String(host).toLowerCase()}:${port}`;
}

function clearTcpRecordTimer(record) {
  if (record.idleTimer) {
    clearTimeout(record.idleTimer);
    record.idleTimer = null;
  }
}

function removeTcpRecord(key) {
  const record = tcpPool.get(key);
  if (!record) return;
  clearTcpRecordTimer(record);
  tcpPool.delete(key);
  try {
    record.socket.destroy();
  } catch {}
}

function armTcpIdleTimer(key, keepAliveMs) {
  const record = tcpPool.get(key);
  if (!record) return;
  clearTcpRecordTimer(record);
  if (!keepAliveMs || keepAliveMs <= 0) return;
  record.idleTimer = setTimeout(() => {
    removeTcpRecord(key);
  }, keepAliveMs);
}

function connectTcpPooled(
  host,
  port,
  {
    connectTimeoutMs = DEFAULT_TCP_CONNECT_TIMEOUT_MS,
    keepAliveMs = DEFAULT_TCP_KEEP_ALIVE_MS
  } = {}
) {
  const key = tcpPoolKey(host, port);
  const existing = tcpPool.get(key);
  if (existing && !existing.socket.destroyed) {
    armTcpIdleTimer(key, keepAliveMs);
    return Promise.resolve(existing);
  }
  removeTcpRecord(key);
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const connectTimer = setTimeout(() => {
      finish(new SendError("ETIMEDOUT", `TCP connect timed out after ${connectTimeoutMs}ms`));
    }, connectTimeoutMs);
    const finish = (err, record) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      if (err) {
        try {
          socket.destroy();
        } catch {}
        reject(err);
      } else {
        resolve(record);
      }
    };
    socket.once("error", (error) => {
      finish(new SendError(error?.code ?? "ETCP", error?.message ?? "TCP error"));
    });
    socket.connect(port, host, () => {
      const record = { socket, key, idleTimer: null };
      socket.on("error", () => {
        removeTcpRecord(key);
      });
      socket.on("close", () => {
        removeTcpRecord(key);
      });
      tcpPool.set(key, record);
      armTcpIdleTimer(key, keepAliveMs);
      finish(null, record);
    });
  });
}

function writeTcpPooled(record, payload, { writeTimeoutMs = DEFAULT_TCP_WRITE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const socket = record?.socket;
    if (!socket || socket.destroyed) {
      reject(new SendError("ECONNRESET", "TCP connection is closed"));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      finish(new SendError("ETIMEDOUT", `TCP write timed out after ${writeTimeoutMs}ms`));
    }, writeTimeoutMs);
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? reject(err) : resolve();
    };
    try {
      socket.write(payload, (error) => {
        if (error) {
          finish(new SendError(error?.code ?? "ETCP", error?.message ?? "TCP write failed"));
          return;
        }
        finish(null);
      });
    } catch (error) {
      finish(new SendError(error?.code ?? "ETCP", error?.message ?? "TCP write threw"));
    }
  });
}

async function sendTcpWithPool(
  host,
  port,
  payload,
  {
    persistent = false,
    keepAliveMs = DEFAULT_TCP_KEEP_ALIVE_MS,
    connectTimeoutMs = DEFAULT_TCP_CONNECT_TIMEOUT_MS,
    writeTimeoutMs = DEFAULT_TCP_WRITE_TIMEOUT_MS
  } = {}
) {
  if (!persistent) {
    await sendTcp(host, port, payload, { connectTimeoutMs, writeTimeoutMs });
    return;
  }
  const key = tcpPoolKey(host, port);
  try {
    const record = await connectTcpPooled(host, port, { connectTimeoutMs, keepAliveMs });
    await writeTcpPooled(record, payload, { writeTimeoutMs });
    armTcpIdleTimer(key, keepAliveMs);
  } catch (error) {
    if (error?.code === "ECONNRESET") {
      removeTcpRecord(key);
      const record = await connectTcpPooled(host, port, { connectTimeoutMs, keepAliveMs });
      await writeTcpPooled(record, payload, { writeTimeoutMs });
      armTcpIdleTimer(key, keepAliveMs);
      return;
    }
    throw error;
  }
}

async function executeCommand(command) {
  validateTarget(command?.target);
  const retry = normalizeRetryOptions(command?.retry);

  if (command.protocol === "udp") {
    await runWithRetry(async () => {
      await sendUdp(command.target.host, command.target.port, commandToBuffer(command));
    }, retry);
    return;
  }
  if (command.protocol === "tcp") {
    await sendTcpWithPool(command.target.host, command.target.port, commandToBuffer(command), {
      persistent: Boolean(command?.target?.persistent),
      keepAliveMs: Number(command?.target?.keepAliveMs) || DEFAULT_TCP_KEEP_ALIVE_MS
    });
    return;
  }
  if (command.protocol === "osc-udp") {
    await runWithRetry(async () => {
      const packet = encodeOscPacket(command.osc);
      assertPayloadSize(packet, "OSC packet");
      await sendUdp(command.target.host, command.target.port, packet);
    }, retry);
    return;
  }

  throw new Error(`Unsupported protocol: ${command.protocol}`);
}

function normalizeWebServerConfig(raw) {
  const port = Number(raw?.port);
  const safePort = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 3210;
  return {
    enabled: Boolean(raw?.enabled),
    host: "0.0.0.0",
    port: safePort
  };
}

function detectPrimaryIpv4Address() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const rows = Array.isArray(interfaces[name]) ? interfaces[name] : [];
      for (const row of rows) {
        if (!row || row.family !== "IPv4" || row.internal) continue;
        if (typeof row.address === "string" && row.address.trim()) {
          return row.address;
        }
      }
    }
  } catch {}
  return "127.0.0.1";
}

function getWebServerStatus() {
  return {
    ...webServerStatus,
    error: webServerStatus.error || undefined
  };
}

function normalizeWebButtonId(raw) {
  const value = String(raw ?? "");
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(value)) {
    throw new Error("Invalid button id");
  }
  return value;
}

function checkWebRunRateLimit(key) {
  const now = Date.now();
  const last = Number(webRunRateLimit.get(key) || 0);
  if (now - last < WEB_RUN_RATE_LIMIT_MS) {
    return false;
  }
  webRunRateLimit.set(key, now);
  if (webRunRateLimit.size > 1000) {
    for (const [entryKey, ts] of webRunRateLimit.entries()) {
      if (now - Number(ts) > 30000) {
        webRunRateLimit.delete(entryKey);
      }
    }
  }
  return true;
}

function webStateSnapshot() {
  const preset = webPresetState && typeof webPresetState === "object" ? webPresetState : createDefaultPreset();
  const ui = preset.ui ?? {};
  const size = ui.buttonSize ?? { w: 72, h: 72 };
  const grid = ui.grid ?? { cols: 4, rows: 3 };
  const cols = Math.max(1, Number(grid.cols) || 4);
  const rows = Math.max(1, Number(grid.rows) || 3);
  const service = ui.service ?? {};
  const serviceVisible = typeof service.showInGrid === "boolean" ? service.showInGrid : true;
  const serviceCol = Math.max(0, Math.min(cols - 1, Number(service.col) || 0));
  const serviceRow = Math.max(0, Math.min(rows - 1, Number(service.row) || 0));
  const occupied = new Set();
  const buttons = [];
  const sourceButtons = Array.isArray(preset.buttons) ? preset.buttons : [];
  for (const btn of sourceButtons) {
    const col = Number(btn?.position?.col);
    const row = Number(btn?.position?.row);
    if (!Number.isInteger(col) || !Number.isInteger(row)) continue;
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
    if (serviceVisible && col === serviceCol && row === serviceRow) continue;
    const key = `${col}:${row}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    buttons.push({
      id: String(btn.id ?? ""),
      label: String(btn.label ?? ""),
      position: { col, row },
      style: {
        bgColor: String(btn?.style?.bgColor ?? "#252525"),
        bgOpacity: Number(btn?.style?.bgOpacity ?? 100),
        borderColor: String(btn?.style?.borderColor ?? "#2f2f2f"),
        textColor: String(btn?.style?.textColor ?? "#ffffff"),
        fontSize: Number(btn?.style?.fontSize ?? 13),
        radius: Number(btn?.style?.radius ?? 8),
        wrapLabel: Boolean(btn?.style?.wrapLabel),
        labelVisibility:
          btn?.style?.labelVisibility === "hover" || btn?.style?.labelVisibility === "never"
            ? btn.style.labelVisibility
            : "always",
        iconAssetId:
          typeof btn?.style?.iconAssetId === "string" && assetRegistry.isValidAssetId(btn.style.iconAssetId)
            ? btn.style.iconAssetId
            : "",
        textAlignX:
          btn?.style?.textAlignX === "left" || btn?.style?.textAlignX === "right" ? btn.style.textAlignX : "center",
        textAlignY:
          btn?.style?.textAlignY === "top" || btn?.style?.textAlignY === "bottom" ? btn.style.textAlignY : "middle"
      }
    });
  }
  return {
    settings: {
      buttonSize: {
        w: Number(size.w) || 72,
        h: Number(size.h) || 72
      },
      grid: {
        cols,
        rows
      }
    },
    buttons
  };
}

function webPageHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>QuickButton Web</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111; color: #eee; }
      .wrap { padding: 14px; }
      .title { font-size: 13px; color: #aaa; margin-bottom: 10px; }
      .grid { display: grid; gap: 8px; }
      .cell { display: flex; align-items: center; justify-content: center; }
      .btn { border: 1px solid #2f2f2f; border-radius: 8px; cursor: pointer; color: #fff; font-weight: 500; width: 100%; height: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; line-height: 1.15; padding: 6px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .btn.wrap { white-space: normal; word-break: break-word; overflow-wrap: anywhere; text-overflow: clip; padding: 2px 4px; }
      .btn.has-bg-icon { background-size: cover; background-position: center; background-repeat: no-repeat; text-shadow: 0 1px 2px rgba(0,0,0,.85), 0 0 1px rgba(0,0,0,.6); }
      .btn-label { display: inline-block; }
      .btn.label-never .btn-label { opacity: 0; }
      .btn.label-hover .btn-label { opacity: 0; transition: opacity 120ms ease; }
      .btn.label-hover:hover .btn-label, .btn.label-hover:focus-visible .btn-label { opacity: 1; }
      .btn:active { transform: scale(0.99); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="title">QuickButton web mode (run only)</div>
      <div id="grid" class="grid"></div>
    </div>
    <script>
      const grid = document.getElementById("grid");
      const alignXMap = { left: "flex-start", center: "center", right: "flex-end" };
      const alignYMap = { top: "flex-start", middle: "center", bottom: "flex-end" };
      async function loadState() {
        const response = await fetch("/api/state", { cache: "no-store" });
        const state = await response.json();
        const cols = Math.max(1, Number(state?.settings?.grid?.cols) || 4);
        const bw = Math.max(16, Number(state?.settings?.buttonSize?.w) || 72);
        const bh = Math.max(16, Number(state?.settings?.buttonSize?.h) || 72);
        grid.style.gridTemplateColumns = "repeat(" + cols + ", " + bw + "px)";
        grid.innerHTML = "";
        const buttons = Array.isArray(state?.buttons) ? state.buttons : [];
        buttons
          .sort((a, b) => (a.position.row - b.position.row) || (a.position.col - b.position.col))
          .forEach((btn) => {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.style.width = bw + "px";
            cell.style.height = bh + "px";
            const el = document.createElement("button");
            el.className = "btn";
            if (btn?.style?.labelVisibility === "hover") el.classList.add("label-hover");
            if (btn?.style?.labelVisibility === "never") el.classList.add("label-never");
            if (btn?.style?.wrapLabel) el.classList.add("wrap");
            const labelEl = document.createElement("span");
            labelEl.className = "btn-label";
            labelEl.textContent = btn.label || "Button";
            el.appendChild(labelEl);
            const bgTransparent = Number(btn?.style?.bgOpacity ?? 100) <= 0;
            el.style.backgroundColor = bgTransparent ? "transparent" : (btn?.style?.bgColor || "#252525");
            if (btn?.style?.iconAssetId) {
              el.classList.add("has-bg-icon");
              el.style.backgroundImage = "url('/api/assets/" + encodeURIComponent(btn.style.iconAssetId) + "')";
              el.style.backgroundSize = "cover";
              el.style.backgroundPosition = "center";
              el.style.backgroundRepeat = "no-repeat";
            } else {
              el.classList.remove("has-bg-icon");
              el.style.backgroundImage = "";
            }
            el.style.borderColor = btn?.style?.borderColor || "#2f2f2f";
            el.style.color = btn?.style?.textColor || "#fff";
            el.style.fontSize = (Number(btn?.style?.fontSize) || 13) + "px";
            el.style.borderRadius = (Number(btn?.style?.radius) || 8) + "px";
            el.style.justifyContent = alignXMap[btn?.style?.textAlignX] || "center";
            el.style.alignItems = alignYMap[btn?.style?.textAlignY] || "center";
            el.style.textAlign = btn?.style?.textAlignX || "center";
            el.addEventListener("click", async () => {
              await fetch("/api/run/" + encodeURIComponent(btn.id), { method: "POST" });
            });
            cell.appendChild(el);
            grid.appendChild(cell);
          });
      }
      loadState();
      setInterval(loadState, 2000);
    </script>
  </body>
</html>`;
}

function webJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function executeChainPayload(payload) {
  runtimeStats.chain.total += 1;
  const chain = Array.isArray(payload.chain) ? payload.chain.slice(0, MAX_COMMANDS) : [];
  const steps = [];
  for (let index = 0; index < chain.length; index += 1) {
    const command = chain[index];
    let result;
    try {
      if (command?.kind === "delay") {
        const delayMs = Math.max(0, Math.min(120000, Math.trunc(Number(command.delayMs) || 0)));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        result = { ok: true };
        log.info(`chain[${index}] delay ${delayMs}ms`);
        steps.push({ index, ...result });
        continue;
      }
      await executeCommand(command);
      result = { ok: true };
      log.info(`chain[${index}] ok`, command?.protocol, command?.target?.host, command?.target?.port);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown chain step error";
      result = { ok: false, code: error?.code, message };
      log.error(`chain[${index}] failed:`, command?.protocol, command?.target?.host, command?.target?.port, message);
    }
    steps.push({ index, ...result });
    if (!result.ok && payload.onError === "stop") break;
  }
  const ok = steps.every((step) => step.ok);
  const okSteps = steps.filter((step) => step.ok).length;
  runtimeStats.chain.stepsTotal += steps.length;
  runtimeStats.chain.stepsOk += okSteps;
  runtimeStats.chain.stepsFailed += steps.length - okSteps;
  if (ok) runtimeStats.chain.ok += 1;
  else runtimeStats.chain.failed += 1;
  return { ok, steps };
}

function resolveWebCommandChain(buttonId) {
  const preset = webPresetState;
  const buttons = Array.isArray(preset?.buttons) ? preset.buttons : [];
  const btn = buttons.find((item) => String(item?.id) === String(buttonId));
  if (!btn) {
    throw new Error("Button not found");
  }
  const contacts = Array.isArray(preset?.contacts) ? preset.contacts : [];
  const chain = [];
  const onError = preset?.settings?.onCommandError === "continue" ? "continue" : "stop";
  for (const command of Array.isArray(btn.commands) ? btn.commands : []) {
    if (command?.enabled === false) continue;
    if (command?.kind === "delay") {
      chain.push({
        kind: "delay",
        delayMs: Math.max(0, Math.min(120000, Math.trunc(Number(command.delayMs) || 0)))
      });
      continue;
    }
    const contact = contacts.find((item) => String(item?.id) === String(command?.contactId ?? ""));
    if (!contact) continue;
    const resolved = {
      protocol: contact.protocol,
      target: {
        host: String(contact?.target?.host ?? ""),
        port: Number(contact?.target?.port),
        persistent: Boolean(contact?.target?.persistent),
        keepAliveMs: Number(contact?.target?.keepAliveMs) || undefined
      }
    };
    if (contact.protocol === "osc-udp") {
      resolved.osc = command?.osc ?? { address: "/ping", args: [] };
    } else {
      resolved.payload = command?.payload ?? { type: "string", value: "" };
    }
    chain.push(resolved);
  }
  return { chain, onError };
}

function stopWebServer() {
  if (!webServerInstance) {
    webServerStatus.running = false;
    return Promise.resolve();
  }
  const active = webServerInstance;
  webServerInstance = null;
  return new Promise((resolve) => {
    active.close(() => resolve());
  });
}

async function startWebServer(config) {
  await stopWebServer();
  const host = "0.0.0.0";
  const port = Number(config.port) || 3210;
  const displayHost = detectPrimaryIpv4Address();
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${host}:${port}`);
      if (req.method === "GET" && requestUrl.pathname === "/") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(webPageHtml());
        return;
      }
      if (req.method === "GET" && requestUrl.pathname === "/api/state") {
        webJson(res, 200, webStateSnapshot());
        return;
      }
      if (req.method === "GET" && requestUrl.pathname.startsWith("/api/assets/")) {
        const assetId = decodeURIComponent(requestUrl.pathname.slice("/api/assets/".length));
        if (!assetRegistry.isValidAssetId(assetId)) {
          webJson(res, 400, { ok: false, message: "Invalid asset id" });
          return;
        }
        const resolved = assetRegistry.resolve(assetId);
        if (!resolved) {
          webJson(res, 404, { ok: false, message: "Asset not found" });
          return;
        }
        const bytes = await fs.readFile(resolved.storedPath);
        res.statusCode = 200;
        res.setHeader("Content-Type", assetRegistry.mimeForExt(path.extname(resolved.storedPath)));
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.end(bytes);
        return;
      }
      if (req.method === "POST" && requestUrl.pathname.startsWith("/api/run/")) {
        if (requestUrl.pathname.length <= "/api/run/".length) {
          webJson(res, 400, { ok: false, message: "Button id is required" });
          return;
        }
        const buttonId = normalizeWebButtonId(
          decodeURIComponent(requestUrl.pathname.slice("/api/run/".length))
        );
        const remoteAddress = String(req.socket?.remoteAddress || "local");
        const rateKey = `${remoteAddress}:${buttonId}`;
        if (!checkWebRunRateLimit(rateKey)) {
          webJson(res, 429, { ok: false, message: "Too many requests" });
          return;
        }
        const payload = resolveWebCommandChain(buttonId);
        if (!payload.chain.length) {
          webJson(res, 400, { ok: false, message: "No active commands configured" });
          return;
        }
        const result = await executeChainPayload(payload);
        webJson(res, result.ok ? 200 : 500, result);
        return;
      }
      webJson(res, 404, { ok: false, message: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown web server error";
      webJson(res, 500, { ok: false, message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  webServerInstance = server;
  webServerStatus = {
    ...webServerStatus,
    enabled: true,
    running: true,
    host,
    port,
    url: `http://${displayHost}:${port}`,
    error: ""
  };
}

async function applyWebServerConfig(config) {
  const normalized = normalizeWebServerConfig(config);
  const sameBinding =
    webServerStatus.running &&
    webServerStatus.enabled &&
    webServerStatus.host === normalized.host &&
    webServerStatus.port === normalized.port;
  webServerStatus = {
    ...webServerStatus,
    enabled: normalized.enabled,
    host: normalized.host,
    port: normalized.port,
    url: `http://${detectPrimaryIpv4Address()}:${normalized.port}`
  };
  if (!normalized.enabled) {
    await stopWebServer();
    webServerStatus.running = false;
    webServerStatus.error = "";
    return getWebServerStatus();
  }
  if (sameBinding) {
    webServerStatus.error = "";
    return getWebServerStatus();
  }
  try {
    await startWebServer(normalized);
    return getWebServerStatus();
  } catch (error) {
    await stopWebServer();
    webServerStatus.running = false;
    webServerStatus.error = error instanceof Error ? error.message : String(error);
    return getWebServerStatus();
  }
}

async function setWebPresetState(rawPreset) {
  const sanitized = sanitizePreset(rawPreset);
  webPresetState = sanitized;
  return applyWebServerConfig(sanitized?.ui?.webServer ?? {});
}

function lastUsedFilePath() {
  return path.join(app.getPath("userData"), "last-used-preset.json");
}

function lastUsedPrevFilePath() {
  return path.join(app.getPath("userData"), "last-used-preset.prev.json");
}

function lastUsedTempFilePath() {
  return `${lastUsedFilePath()}.tmp`;
}

async function readLastUsedPath(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return typeof parsed?.path === "string" && parsed.path ? parsed.path : null;
}

async function loadLastUsedPresetPath() {
  try {
    return { path: await readLastUsedPath(lastUsedFilePath()), recoveredFromBackup: false };
  } catch {
    try {
      const recoveredPath = await readLastUsedPath(lastUsedPrevFilePath());
      return { path: recoveredPath, recoveredFromBackup: true };
    } catch {
      return { path: null, recoveredFromBackup: false };
    }
  }
}

async function saveLastUsedPresetPath(presetPath) {
  const targetPath = lastUsedFilePath();
  const prevPath = lastUsedPrevFilePath();
  const tempPath = lastUsedTempFilePath();
  const payload = JSON.stringify(
    { path: presetPath, updatedAt: new Date().toISOString() },
    null,
    2
  );

  try {
    await fs.copyFile(targetPath, prevPath);
  } catch {
    // No previous file yet.
  }

  const handle = await fs.open(tempPath, "w");
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tempPath, targetPath);
}

function getAppInfo() {
  let gitHash = "";
  if (!app.isPackaged) {
    try {
      gitHash = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: path.join(__dirname, ".."),
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8"
      }).trim();
    } catch {
      gitHash = "";
    }
  }
  return {
    version: app.getVersion(),
    gitHash,
    isPackaged: app.isPackaged,
    sessionId: SESSION_ID
  };
}

function summarizePresetForDiagnostics(preset) {
  const buttons = Array.isArray(preset?.buttons) ? preset.buttons : [];
  const contacts = Array.isArray(preset?.contacts) ? preset.contacts : [];
  let commandCount = 0;
  const protocols = { udp: 0, tcp: 0, "osc-udp": 0, other: 0 };
  const payloadTypes = { string: 0, hex: 0, other: 0 };
  for (const button of buttons) {
    const commands = Array.isArray(button?.commands) ? button.commands : [];
    commandCount += commands.length;
    for (const command of commands) {
      const protocol = command?.protocol;
      if (protocol === "udp" || protocol === "tcp" || protocol === "osc-udp") protocols[protocol] += 1;
      else protocols.other += 1;
      if (protocol === "osc-udp") continue;
      const payloadType = command?.payload?.type;
      if (payloadType === "string" || payloadType === "hex") payloadTypes[payloadType] += 1;
      else payloadTypes.other += 1;
    }
  }
  return {
    version: preset?.version ?? null,
    buttons: buttons.length,
    contacts: contacts.length,
    commands: commandCount,
    protocols,
    payloadTypes,
    grid: {
      cols: Number(preset?.ui?.grid?.cols) || null,
      rows: Number(preset?.ui?.grid?.rows) || null
    }
  };
}

async function readLogTailLines(filePath, maxLines = 200) {
  if (!filePath) return [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw.split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  }
}

async function buildDiagnosticsBundle() {
  const bundle = {
    generatedAt: new Date().toISOString(),
    sessionId: SESSION_ID,
    app: getAppInfo(),
    platform: { os: process.platform, arch: process.arch },
    paths: {
      userData: app.getPath("userData"),
      logFile: log.getLogFile(),
      lastUsedPointer: lastUsedFilePath()
    },
    preset: {
      currentPath: null,
      pointerRecoveredFromBackup: false,
      file: { sizeBytes: null, mtime: null },
      summary: null,
      loadError: null
    },
    runtimeStats: {
      testSend: { ...runtimeStats.testSend },
      chain: { ...runtimeStats.chain }
    },
    logsTail: []
  };

  const lastUsed = await loadLastUsedPresetPath();
  bundle.preset.currentPath = lastUsed.path;
  bundle.preset.pointerRecoveredFromBackup = Boolean(lastUsed.recoveredFromBackup);
  if (lastUsed.path) {
    try {
      const stat = await fs.stat(lastUsed.path);
      bundle.preset.file.sizeBytes = Number(stat.size) || 0;
      bundle.preset.file.mtime = stat.mtime?.toISOString?.() ?? null;
      const raw = await fs.readFile(lastUsed.path, "utf8");
      const sanitized = sanitizePreset(JSON.parse(raw));
      bundle.preset.summary = summarizePresetForDiagnostics(sanitized);
    } catch (error) {
      bundle.preset.loadError = error?.message ?? String(error);
    }
  }
  bundle.logsTail = await readLogTailLines(log.getLogFile(), 220);
  return bundle;
}

function diagnosticsSupportSummary(bundle) {
  const presetSummary = bundle?.preset?.summary ?? {};
  const testSendStats = bundle?.runtimeStats?.testSend ?? {};
  const chainStats = bundle?.runtimeStats?.chain ?? {};
  const lines = [
    `QuickButton support summary`,
    `Session: ${bundle?.sessionId ?? "n/a"}`,
    `Version: ${bundle?.app?.version ?? "n/a"}${bundle?.app?.gitHash ? ` (${bundle.app.gitHash})` : ""}`,
    `Platform: ${bundle?.platform?.os ?? "n/a"} ${bundle?.platform?.arch ?? ""}`.trim(),
    `Preset: buttons=${presetSummary.buttons ?? 0}, contacts=${presetSummary.contacts ?? 0}, commands=${presetSummary.commands ?? 0}`,
    `Runtime: testSend total=${testSendStats.total ?? 0}, ok=${testSendStats.ok ?? 0}, failed=${testSendStats.failed ?? 0}`,
    `Runtime: chain total=${chainStats.total ?? 0}, ok=${chainStats.ok ?? 0}, failed=${chainStats.failed ?? 0}, steps=${chainStats.stepsTotal ?? 0}`
  ];
  return lines.join("\n");
}

async function exportDiagnosticsBundle() {
  const bundle = await buildDiagnosticsBundle();
  const defaultName = `quickbutton-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const result = await dialog.showSaveDialog({
    defaultPath: path.join(app.getPath("documents"), defaultName),
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  await fs.writeFile(result.filePath, JSON.stringify(bundle, null, 2), "utf8");
  return result.filePath;
}

function configureAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
}

async function checkForUpdatesFromMenu() {
  if (!autoUpdater) {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Check for updates",
      message: "Auto-updater is not configured yet.",
      detail: "Install electron-updater and configure a publish provider (GitHub Releases or S3)."
    });
    return;
  }
  if (!app.isPackaged) {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Check for updates",
      message: "Update checks are available only in packaged builds."
    });
    return;
  }
  const result = await new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };
    const onAvailable = (info) =>
      finish({
        type: "available",
        message: `Update ${info?.version ?? "new version"} is available.`,
        detail: "Open the release page to download the latest build."
      });
    const onNotAvailable = () =>
      finish({
        type: "none",
        message: "You already have the latest version."
      });
    const onError = (err) =>
      finish({
        type: "error",
        message: "Failed to check for updates.",
        detail: err?.message ?? String(err)
      });
    const cleanup = () => {
      autoUpdater.off("update-available", onAvailable);
      autoUpdater.off("update-not-available", onNotAvailable);
      autoUpdater.off("error", onError);
    };
    autoUpdater.on("update-available", onAvailable);
    autoUpdater.on("update-not-available", onNotAvailable);
    autoUpdater.on("error", onError);
    autoUpdater.checkForUpdates().catch(onError);
  });
  if (result.type === "available") {
    const box = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Check for updates",
      message: result.message,
      detail: result.detail,
      buttons: ["Open releases", "Close"],
      defaultId: 0,
      cancelId: 1
    });
    if (box.response === 0) {
      shell.openExternal(RELEASES_URL).catch((err) => {
        log.error("openExternal failed:", err?.message ?? err);
      });
    }
    return;
  }
  await dialog.showMessageBox(mainWindow, {
    type: result.type === "error" ? "warning" : "info",
    title: "Check for updates",
    message: result.message,
    detail: result.detail
  });
}

async function hydrateLegacyIconPaths(preset) {
  if (!Array.isArray(preset?.buttons)) return preset;
  for (const button of preset.buttons) {
    const style = button?.style;
    if (!style) continue;
    if (style.iconAssetId) {
      delete style.iconPath;
      continue;
    }
    if (!style.iconPath) continue;
    try {
      const registered = await assetRegistry.registerFromDisk(style.iconPath);
      if (registered) {
        style.iconAssetId = registered.assetId;
        delete style.iconPath;
      } else {
        // Source file missing -> drop the dangling pointer so renderer shows a plain button.
        delete style.iconPath;
      }
    } catch (err) {
      log.warn("hydrate icon failed:", err?.message ?? err);
      delete style.iconPath;
    }
  }
  return preset;
}

async function openPresetFromDisk(filePath) {
  let targetPath = filePath;
  if (!targetPath) {
    const result = await dialog.showOpenDialog({
      filters: [{ name: "Preset", extensions: ["json"] }],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      throw new Error("Open preset canceled");
    }
    targetPath = result.filePaths[0];
  }
  const stat = await fs.stat(targetPath);
  assertPresetFileSize(stat.size);
  const raw = await fs.readFile(targetPath, "utf8");
  assertPresetFileSize(Buffer.byteLength(raw, "utf8"), "Preset content");
  const sanitized = sanitizePreset(JSON.parse(raw));
  return hydrateLegacyIconPaths(sanitized);
}

async function savePresetToDisk(payload) {
  let targetPath = payload.path;
  if (!targetPath) {
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath("userData"), "preset.json"),
      filters: [{ name: "Preset", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) {
      throw new Error("Save preset canceled");
    }
    targetPath = result.filePath;
  }
  const sanitized = sanitizePreset(payload.preset);
  const serialized = JSON.stringify(sanitized, null, 2);
  assertPresetFileSize(Buffer.byteLength(serialized, "utf8"), "Preset to save");
  await fs.writeFile(targetPath, serialized, "utf8");
  return { path: targetPath };
}

function registerIpc() {
  ipcMain.removeHandler(channels.appGetInfo);
  ipcMain.handle(channels.appGetInfo, async () => getAppInfo());

  ipcMain.removeHandler(channels.windowMinimize);
  ipcMain.handle(channels.windowMinimize, async () => {
    mainWindow?.minimize();
  });

  ipcMain.removeHandler(channels.windowClose);
  ipcMain.handle(channels.windowClose, async () => {
    mainWindow?.close();
  });

  ipcMain.removeHandler(channels.windowStartDrag);
  ipcMain.handle(channels.windowStartDrag, async () => {
    // Drag is implemented via CSS app-region in renderer for M1.
  });

  defineIpc(channels.windowSetAlwaysOnTop, async (_event, payload) => {
    mainWindow?.setAlwaysOnTop(payload.value);
  });

  defineIpc(channels.windowSetContentSize, async (_event, payload) => {
    if (!mainWindow) return;
    mainWindow.setContentSize(payload.width, payload.height);
  });

  defineIpc(channels.windowSetIgnoreMouseEvents, async (_event, payload) => {
    if (!mainWindow) return;
    mainWindow.setIgnoreMouseEvents(payload.ignore, { forward: payload.forward });
  });

  ipcMain.removeHandler(channels.windowGetCursorInWindow);
  ipcMain.handle(channels.windowGetCursorInWindow, async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { inside: false, x: 0, y: 0 };
    }
    const point = screen.getCursorScreenPoint();
    const bounds = mainWindow.getContentBounds();
    const x = point.x - bounds.x;
    const y = point.y - bounds.y;
    const inside = x >= 0 && y >= 0 && x < bounds.width && y < bounds.height;
    return { inside, x, y };
  });

  defineIpc(channels.diagnosticsReportError, async (_event, payload) => {
    const parts = [
      `renderer.${payload.kind ?? "error"}`,
      payload.sessionId ? `[rendererSid:${payload.sessionId}]` : "",
      payload.name ? `[${payload.name}]` : "",
      payload.message || "",
      payload.source ? `@ ${payload.source}:${payload.lineno ?? 0}:${payload.colno ?? 0}` : "",
      payload.stack ? `\n${payload.stack}` : ""
    ]
      .filter(Boolean)
      .join(" ");
    log.error(parts);
  });

  defineIpc(channels.dialogPickIconFile, async (_event, payload) => {
    const options = {
      title: "Select icon",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "svg", "jpg", "jpeg", "gif", "webp", "ico"] }]
    };
    if (payload.currentPath) options.defaultPath = payload.currentPath;
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, assetId: null };
    }
    const sourcePath = result.filePaths[0];
    try {
      const registered = await assetRegistry.registerFromDisk(sourcePath);
      if (!registered) {
        return { canceled: false, assetId: null, error: "Failed to read selected file" };
      }
      return { canceled: false, assetId: registered.assetId };
    } catch (err) {
      log.error("pickIconFile register failed:", err?.message ?? err);
      return { canceled: false, assetId: null, error: err?.message ?? "Unknown error" };
    }
  });

  defineIpc(channels.menuSetShowServiceInGrid, async (_event, payload) => {
    const menu = Menu.getApplicationMenu();
    const item = menu?.getMenuItemById("view-show-service-grid");
    if (item) item.checked = payload.value;
  });

  ipcMain.removeHandler(channels.webServerGetStatus);
  ipcMain.handle(channels.webServerGetStatus, async () => getWebServerStatus());

  defineIpc(channels.webServerOpen, async (_event, payload) => {
    await shell.openExternal(payload.url);
    return { ok: true };
  });

  defineIpc(channels.webServerRestart, async (_event, payload) => {
    const sanitized = sanitizePreset(payload.preset);
    webPresetState = sanitized;
    const config = normalizeWebServerConfig(sanitized?.ui?.webServer ?? {});
    if (!config.enabled) {
      return applyWebServerConfig(config);
    }
    await stopWebServer();
    webServerStatus.running = false;
    return applyWebServerConfig(config);
  });

  defineIpc(channels.webServerSyncState, async (_event, payload) => {
    return setWebPresetState(payload.preset);
  });

  ipcMain.removeHandler(channels.runtimeTestSend);
  ipcMain.handle(channels.runtimeTestSend, async (_event, command) => {
    runtimeStats.testSend.total += 1;
    try {
      await executeCommand(command);
      runtimeStats.testSend.ok += 1;
      log.info("testSend ok", command?.protocol, command?.target?.host, command?.target?.port);
      return { ok: true };
    } catch (error) {
      runtimeStats.testSend.failed += 1;
      const message = error instanceof Error ? error.message : "Unknown send error";
      log.error(
        "testSend failed:",
        command?.protocol,
        command?.target?.host,
        command?.target?.port,
        message
      );
      return { ok: false, code: error?.code, message };
    }
  });

  defineIpc(channels.runtimeExecuteChain, async (_event, payload) => {
    return executeChainPayload(payload);
  });

  ipcMain.removeHandler(channels.presetOpen);
  ipcMain.handle(channels.presetOpen, async () => {
    try {
      const preset = await openPresetFromDisk();
      await setWebPresetState(preset);
      log.info("preset opened");
      return preset;
    } catch (err) {
      log.error("preset open failed:", err);
      throw err;
    }
  });

  ipcMain.removeHandler(channels.presetSave);
  ipcMain.handle(channels.presetSave, async (_event, payload) => {
    try {
      await setWebPresetState(payload.preset);
      const result = await savePresetToDisk(payload);
      await saveLastUsedPresetPath(result.path);
      log.info("preset saved:", result.path);
      return result;
    } catch (err) {
      log.error("preset save failed:", err);
      throw err;
    }
  });

  ipcMain.removeHandler(channels.presetSaveAs);
  ipcMain.handle(channels.presetSaveAs, async (_event, payload) => {
    await setWebPresetState(payload.preset);
    const result = await savePresetToDisk({ preset: payload.preset });
    await saveLastUsedPresetPath(result.path);
    return result;
  });

  ipcMain.removeHandler(channels.presetLoadLast);
  ipcMain.handle(channels.presetLoadLast, async () => {
    const { path: presetPath, recoveredFromBackup } = await loadLastUsedPresetPath();
    if (!presetPath) {
      const preset = createDefaultPreset();
      await setWebPresetState(preset);
      return { preset, path: null, recoveredFromBackup: false };
    }
    try {
      const preset = sanitizePreset(await openPresetFromDisk(presetPath));
      await setWebPresetState(preset);
      return {
        preset,
        path: presetPath,
        recoveredFromBackup
      };
    } catch {
      const preset = createDefaultPreset();
      await setWebPresetState(preset);
      return { preset, path: null, recoveredFromBackup: false };
    }
  });
}

function createMainWindow() {
  const appIcon = createAppIcon();
  mainWindow = new BrowserWindow({
    width: 420,
    height: 220,
    title: APP_NAME,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelName = ["VERBOSE", "INFO", "WARN", "ERROR"][level] ?? "INFO";
    if (levelName === "ERROR" || levelName === "WARN") {
      log.warn(`renderer.console.${levelName}: ${message} @ ${sourceId}:${line}`);
    }
  });
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    log.error(`preload-error ${preloadPath}:`, error?.stack ?? error?.message ?? String(error));
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    log.error(`did-fail-load ${code} ${desc} ${url}`);
  });

  if (process.env.QB_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function buildApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }]
          }
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            mainWindow?.webContents.send(menuEvents.fileOpen);
          }
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            mainWindow?.webContents.send(menuEvents.fileSave);
          }
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => {
            mainWindow?.webContents.send(menuEvents.fileSaveAs);
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          label: "Edit",
          accelerator: "CmdOrCtrl+1",
          click: () => {
            mainWindow?.webContents.send(menuEvents.viewEdit);
          }
        },
        {
          label: "Run",
          accelerator: "CmdOrCtrl+2",
          click: () => {
            mainWindow?.webContents.send(menuEvents.viewRun);
          }
        },
        { type: "separator" },
        {
          id: "view-show-service-grid",
          label: "Show service in grid",
          type: "checkbox",
          checked: true,
          accelerator: "CmdOrCtrl+G",
          click: (menuItem) => {
            mainWindow?.webContents.send(menuEvents.viewToggleServiceGrid, {
              value: menuItem.checked
            });
          }
        },
        { type: "separator" },
        {
          label: "Show keyboard shortcuts",
          accelerator: "F1",
          click: () => {
            mainWindow?.webContents.send(menuEvents.viewShowShortcuts);
          }
        }
      ]
    },
    {
      label: "Help",
      role: "help",
      submenu: [
        {
          label: "Open logs folder",
          click: () => {
            const dir = log.getLogDir();
            if (dir) {
              shell.openPath(dir).catch((err) => log.error("shell.openPath failed:", err));
            }
          }
        },
        {
          label: "Show log file",
          click: () => {
            const file = log.getLogFile();
            if (file) {
              shell.showItemInFolder(file);
            }
          }
        },
        {
          label: "Export diagnostics bundle...",
          click: () => {
            exportDiagnosticsBundle()
              .then(async (savedPath) => {
                if (!savedPath) return;
                const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
                await dialog.showMessageBox(parent, {
                  type: "info",
                  title: "Diagnostics bundle",
                  message: "Diagnostics bundle exported.",
                  detail: savedPath
                });
              })
              .catch((err) => {
                log.error("exportDiagnosticsBundle failed:", err?.message ?? err);
                const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
                dialog.showMessageBox(parent, {
                  type: "error",
                  title: "Diagnostics bundle",
                  message: "Failed to export diagnostics bundle.",
                  detail: err?.message ?? String(err)
                });
              });
          }
        },
        {
          label: "Copy support summary",
          click: () => {
            buildDiagnosticsBundle()
              .then((bundle) => {
                clipboard.writeText(diagnosticsSupportSummary(bundle));
                const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
                return dialog.showMessageBox(parent, {
                  type: "info",
                  title: "Support summary",
                  message: "Copied support summary to clipboard."
                });
              })
              .catch((err) => {
                log.error("copy support summary failed:", err?.message ?? err);
              });
          }
        },
        {
          type: "separator"
        },
        {
          label: "Check for updates...",
          click: () => {
            checkForUpdatesFromMenu().catch((err) => {
              log.error("checkForUpdatesFromMenu failed:", err?.message ?? err);
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.setName(APP_NAME);
app.setAboutPanelOptions({
  applicationName: APP_NAME
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: "qb-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
      corsEnabled: false
    }
  }
]);

function registerQbAssetProtocol() {
  protocol.handle("qb-asset", async (request) => {
    try {
      const url = new URL(request.url);
      // qb-asset://<assetId>  -> hostname carries the id (URL normalizes to lowercase).
      // qb-asset:///<assetId> -> path carries the id (defensive).
      const candidate = url.hostname || url.pathname.replace(/^\/+/, "");
      const decoded = decodeURIComponent(candidate || "").toLowerCase();
      const resolved = assetRegistry.resolve(decoded);
      if (!resolved) {
        return new Response("Asset not found", { status: 404 });
      }
      const fileUrl = pathToFileURL(resolved.storedPath).toString();
      const fileResponse = await electronNet.fetch(fileUrl);
      const headers = new Headers(fileResponse.headers);
      const ext = require("node:path").extname(resolved.storedPath);
      headers.set("Content-Type", assetRegistry.mimeForExt(ext));
      headers.set("Cache-Control", "private, max-age=3600");
      return new Response(fileResponse.body, {
        status: fileResponse.status,
        statusText: fileResponse.statusText,
        headers
      });
    } catch (err) {
      log.error("qb-asset handler failed:", err?.message ?? err);
      return new Response("Asset handler error", { status: 500 });
    }
  });
}

const CSP_HEADER =
  "default-src 'self'; " +
  "img-src 'self' data: qb-asset:; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; " +
  "connect-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "frame-ancestors 'none'; " +
  "form-action 'none';";

let crashDialogVisible = false;
let lastCrashDialogAt = 0;
const CRASH_DIALOG_COOLDOWN_MS = 5000;

async function showCrashDialog({ title, message }) {
  if (crashDialogVisible) return;
  const now = Date.now();
  if (now - lastCrashDialogAt < CRASH_DIALOG_COOLDOWN_MS) return;
  crashDialogVisible = true;
  lastCrashDialogAt = now;
  try {
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const result = await dialog.showMessageBox(parent, {
      type: "error",
      buttons: ["Open logs", "Close"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: title ?? "QuickButton error",
      message: title ?? "QuickButton ran into a problem",
      detail: message ?? "See logs for details."
    });
    if (result.response === 0) {
      const dir = log.getLogDir();
      if (dir) {
        shell.openPath(dir).catch((err) => log.error("shell.openPath failed:", err));
      }
    }
  } catch (err) {
    log.error("showCrashDialog failed:", err?.message ?? err);
  } finally {
    crashDialogVisible = false;
  }
}

function installCrashHandlers() {
  process.on("uncaughtException", (err) => {
    log.error("uncaughtException:", err?.stack ?? err?.message ?? String(err));
    showCrashDialog({
      title: "QuickButton encountered an unexpected error",
      message: `Uncaught exception: ${err?.message ?? String(err)}`
    });
  });
  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    log.error("unhandledRejection:", message);
  });
  app.on("render-process-gone", (_event, webContents, details) => {
    log.error(
      "render-process-gone:",
      JSON.stringify({ reason: details?.reason, exitCode: details?.exitCode })
    );
    // "clean-exit" / "exited" with code 0 are benign (e.g. window.close()).
    const benign = details?.reason === "clean-exit" || details?.reason === "exited";
    if (!benign) {
      showCrashDialog({
        title: "QuickButton renderer crashed",
        message: `Reason: ${details?.reason ?? "unknown"} (exit code ${details?.exitCode ?? "?"})`
      });
    }
  });
  app.on("child-process-gone", (_event, details) => {
    log.error(
      "child-process-gone:",
      JSON.stringify({
        type: details?.type,
        reason: details?.reason,
        exitCode: details?.exitCode,
        name: details?.name
      })
    );
  });
}

function installCspHeader() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders["Content-Security-Policy"] = [CSP_HEADER];
    callback({ responseHeaders });
  });
}

function disposeTcpPool() {
  for (const key of tcpPool.keys()) {
    removeTcpRecord(key);
  }
}

app.whenReady().then(async () => {
  const userData = app.getPath("userData");
  log.setSessionId(SESSION_ID);
  log.init(userData);
  log.info(`QuickButton ${app.getVersion()} starting on ${process.platform} ${process.arch}`);
  if (process.platform === "darwin" && app.dock?.setIcon) {
    app.dock.setIcon(createAppIcon());
  }
  try {
    await assetRegistry.init(userData);
  } catch (err) {
    log.error("asset registry init failed:", err?.message ?? err);
  }
  installCrashHandlers();
  installCspHeader();
  registerQbAssetProtocol();
  registerIpc();
  configureAutoUpdater();
  createMainWindow();
  buildApplicationMenu();
});

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("before-quit", () => {
  disposeTcpPool();
  void stopWebServer();
});

app.on("window-all-closed", () => {
  disposeTcpPool();
  void stopWebServer();
  if (process.platform !== "darwin") app.quit();
});
