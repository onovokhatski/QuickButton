const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { PNG } = require("pngjs");
const pngToIcoLib = require("png-to-ico");

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");
const BASE_PNG = path.join(BUILD_DIR, "icon.png");
const ICONSET_DIR = path.join(BUILD_DIR, "icon.iconset");
const ICNS_PATH = path.join(BUILD_DIR, "icon.icns");
const ICO_PATH = path.join(BUILD_DIR, "icon.ico");

const ICONSET_SIZES = [16, 32, 64, 128, 256, 512, 1024];

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = clampByte(r);
  png.data[idx + 1] = clampByte(g);
  png.data[idx + 2] = clampByte(b);
  png.data[idx + 3] = clampByte(a);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function gradientColor(nx, ny) {
  const t = Math.max(0, Math.min(1, 0.6 * nx + 0.4 * ny));
  return {
    r: mix(66, 131, t),
    g: mix(201, 63, t),
    b: mix(255, 209, t)
  };
}

function renderIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.455;
  const corner = size * 0.205;
  const ringOuter = size * 0.32;
  const ringInner = size * 0.27;
  const buttonRadius = size * 0.225;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const rx = Math.abs(x + 0.5 - cx);
      const ry = Math.abs(y + 0.5 - cy);
      const px = x + 0.5;
      const py = y + 0.5;
      let insideRoundedSquare = false;

      if (rx <= outer - corner && ry <= outer) {
        insideRoundedSquare = true;
      } else if (ry <= outer - corner && rx <= outer) {
        insideRoundedSquare = true;
      } else {
        const cxCorner = Math.max(0, rx - (outer - corner));
        const cyCorner = Math.max(0, ry - (outer - corner));
        insideRoundedSquare = cxCorner * cxCorner + cyCorner * cyCorner <= corner * corner;
      }

      if (!insideRoundedSquare) {
        setPixel(png, x, y, 0, 0, 0, 0);
        continue;
      }

      const nx = px / size;
      const ny = py / size;
      const bg = gradientColor(nx, ny);
      setPixel(png, x, y, bg.r, bg.g, bg.b, 255);

      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ringOuter && dist >= ringInner) {
        setPixel(png, x, y, 255, 255, 255, 62);
      }
      if (dist <= buttonRadius) {
        const shade = Math.max(0, Math.min(1, dist / buttonRadius));
        const red = mix(255, 170, shade);
        const green = mix(112, 20, shade);
        const blue = mix(112, 20, shade);
        setPixel(png, x, y, red, green, blue, 255);
      }
    }
  }

  return PNG.sync.write(png);
}

async function createIconsetFromBasePng() {
  await fs.rm(ICONSET_DIR, { recursive: true, force: true });
  await fs.mkdir(ICONSET_DIR, { recursive: true });

  for (const size of ICONSET_SIZES) {
    const oneX = path.join(ICONSET_DIR, `icon_${size}x${size}.png`);
    const twoX = path.join(ICONSET_DIR, `icon_${size / 2}x${size / 2}@2x.png`);
    if (size === 1024) {
      await fs.copyFile(BASE_PNG, oneX);
    } else {
      await execFileAsync("sips", ["-z", String(size), String(size), BASE_PNG, "--out", oneX]);
    }
    await fs.copyFile(oneX, twoX);
  }

  await execFileAsync("iconutil", ["-c", "icns", ICONSET_DIR, "-o", ICNS_PATH]);
}

async function createIcoFromBasePng() {
  const pngToIco = pngToIcoLib.default ?? pngToIcoLib;
  // NSIS/Windows icons only support sizes up to 256x256.
  // Use the iconset PNGs that were already generated at the canonical sizes.
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const sources = [];
  for (const size of icoSizes) {
    const candidate = path.join(ICONSET_DIR, `icon_${size}x${size}.png`);
    try {
      await fs.access(candidate);
      sources.push(candidate);
    } catch {
      // fall through: skip missing sizes
    }
  }
  if (sources.length === 0) {
    sources.push(BASE_PNG);
  }
  const icoBuffer = await pngToIco(sources);
  await fs.writeFile(ICO_PATH, icoBuffer);
}

async function main() {
  await fs.mkdir(BUILD_DIR, { recursive: true });
  await fs.writeFile(BASE_PNG, renderIcon(1024));
  await createIconsetFromBasePng();
  await createIcoFromBasePng();
  // Keep iconset for reproducibility/debugging.
  // To clean it, remove build/icon.iconset manually.

  console.log("Generated icon assets:", BASE_PNG, ICNS_PATH, ICO_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
