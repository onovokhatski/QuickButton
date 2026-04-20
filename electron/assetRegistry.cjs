const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

// qb-asset:// registry:
//   <userData>/assets/<sha1>.<ext>   <- blob storage (content-addressed)
//   <userData>/asset-registry.json   <- metadata index
//
// Asset IDs are SHA-1 of the file bytes. They are validated to match [0-9a-f]{40}
// before any filesystem lookup. This prevents path traversal through IPC payloads.

const ASSET_ID_RE = /^[a-f0-9]{40}$/;
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"]);

let assetsDir = null;
let registryFile = null;
let registry = { version: 1, assets: {} };

function assertInitialized() {
  if (!assetsDir) throw new Error("AssetRegistry not initialized");
}

function isValidAssetId(value) {
  return typeof value === "string" && ASSET_ID_RE.test(value);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function loadRegistryFile() {
  try {
    const raw = await fsp.readFile(registryFile, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.assets &&
      typeof parsed.assets === "object"
    ) {
      registry = parsed;
    }
  } catch {
    // Missing or corrupted file -> start fresh.
    registry = { version: 1, assets: {} };
  }
}

async function persistRegistryFile() {
  const tmp = `${registryFile}.tmp`;
  const data = JSON.stringify(registry, null, 2);
  await fsp.writeFile(tmp, data, "utf8");
  await fsp.rename(tmp, registryFile);
}

async function init(userDataDir) {
  assetsDir = path.join(userDataDir, "assets");
  registryFile = path.join(userDataDir, "asset-registry.json");
  await ensureDir(assetsDir);
  await loadRegistryFile();
}

function sha1OfBytes(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function safeExtFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : ".bin";
}

async function registerFromDisk(sourcePath) {
  assertInitialized();
  if (typeof sourcePath !== "string" || !sourcePath) return null;
  let buf;
  try {
    buf = await fsp.readFile(sourcePath);
  } catch {
    return null;
  }
  const assetId = sha1OfBytes(buf);
  const ext = safeExtFor(sourcePath);
  const storedName = `${assetId}${ext}`;
  const storedPath = path.join(assetsDir, storedName);
  if (!registry.assets[assetId]) {
    try {
      await fsp.access(storedPath, fs.constants.F_OK);
    } catch {
      await fsp.writeFile(storedPath, buf);
    }
    registry.assets[assetId] = {
      storedName,
      originalName: path.basename(sourcePath),
      size: buf.length,
      registeredAt: new Date().toISOString()
    };
    await persistRegistryFile();
  }
  return { assetId, storedPath, storedName };
}

function resolve(assetId) {
  assertInitialized();
  if (!isValidAssetId(assetId)) return null;
  const entry = registry.assets[assetId];
  if (!entry) return null;
  const storedPath = path.join(assetsDir, entry.storedName);
  return { assetId, storedPath, entry };
}

function mimeForExt(ext) {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/vnd.microsoft.icon";
    case ".bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

module.exports = {
  init,
  registerFromDisk,
  resolve,
  mimeForExt,
  isValidAssetId,
  get assetsDir() {
    return assetsDir;
  }
};
