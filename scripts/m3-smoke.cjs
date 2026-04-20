const fs = require("node:fs");
const path = require("node:path");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function run() {
  const root = path.resolve(__dirname, "..");
  const packageJsonPath = path.join(root, "package.json");
  const packageJson = readJson(packageJsonPath);

  assert(
    packageJson.main === "electron/main.cjs",
    "package.json main should point to electron/main.cjs"
  );
  assert(packageJson.build?.appId, "electron-builder appId is required");
  assert(Array.isArray(packageJson.build?.files), "electron-builder files list is required");

  const requiredFiles = ["electron/main.cjs", "electron/preload.cjs", "src/renderer/index.html"];

  for (const rel of requiredFiles) {
    const full = path.join(root, rel);
    assert(fs.existsSync(full), `Required file is missing: ${rel}`);
  }

  const renderer = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  assert(renderer.includes("M3 ready"), "Renderer should display M3 ready status");
  assert(renderer.includes("Max 100 buttons reached"), "Renderer should enforce button limit");
  assert(renderer.includes("Max 10 commands per button"), "Renderer should enforce command limit");

  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  assert(main.includes("sanitizePreset"), "Main process should sanitize preset input");
  assert(
    packageJson.devDependencies?.["electron-builder"],
    "electron-builder dependency is required"
  );

  console.log("M3 smoke checks passed");
}

run();
