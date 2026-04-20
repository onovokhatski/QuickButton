const path = require("node:path");
const fs = require("node:fs");

const MAX_BYTES = 512 * 1024;

let logFilePath = null;
let initialized = false;
let sessionId = "";

function formatTime(date) {
  return date.toISOString();
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function rotateIfNeeded() {
  if (!logFilePath) return;
  try {
    const stat = fs.statSync(logFilePath);
    if (stat.size > MAX_BYTES) {
      const backup = logFilePath.replace(/\.log$/, ".1.log");
      try {
        fs.unlinkSync(backup);
      } catch {}
      try {
        fs.renameSync(logFilePath, backup);
      } catch {}
    }
  } catch {}
}

function write(level, args) {
  if (!initialized || !logFilePath) return;
  rotateIfNeeded();
  const sidPrefix = sessionId ? ` [sid:${sessionId}]` : "";
  const line = `[${formatTime(new Date())}] [${level}]${sidPrefix} ${args.map(stringify).join(" ")}\n`;
  try {
    fs.appendFileSync(logFilePath, line, "utf8");
  } catch {}
  const stream = level === "ERROR" ? console.error : console.log;
  stream(`[${level}]${sidPrefix}`, ...args);
}

function stringify(value) {
  if (value instanceof Error) {
    return `${value.message} ${value.stack ?? ""}`;
  }
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function init(userDataPath) {
  ensureDir(userDataPath);
  logFilePath = path.join(userDataPath, "quickbutton.log");
  initialized = true;
  info("=== QuickButton log start ===");
}

function setSessionId(value) {
  sessionId = value ? String(value) : "";
}

function info(...args) {
  write("INFO", args);
}
function warn(...args) {
  write("WARN", args);
}
function error(...args) {
  write("ERROR", args);
}
function getLogFile() {
  return logFilePath;
}
function getLogDir() {
  return logFilePath ? path.dirname(logFilePath) : null;
}

module.exports = { init, info, warn, error, getLogFile, getLogDir, setSessionId };
