/* global window document */
const { _electron: electron, expect, test } = require("@playwright/test");
const dgram = require("node:dgram");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const FIXTURE_V1 = path.join(__dirname, "..", "fixtures", "preset.v1.json");

function createUdpProbeServer() {
  const socket = dgram.createSocket("udp4");
  let lastMessage = "";
  const packetPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for UDP packet"));
    }, 15000);
    socket.once("message", (msg) => {
      clearTimeout(timer);
      lastMessage = msg.toString("utf8");
      resolve(lastMessage);
    });
  });
  return {
    socket,
    packetPromise,
    get lastMessage() {
      return lastMessage;
    }
  };
}

async function launchApp() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    args: ["."],
    cwd: path.join(__dirname, "..", ".."),
    env
  });
}

/** First-launch onboarding blocks pointer events until dismissed (localStorage may skip it). */
async function dismissOnboardingIfVisible(page) {
  const dismiss = page.locator("#onboarding-dismiss");
  try {
    await dismiss.waitFor({ state: "visible", timeout: 2000 });
    await dismiss.click();
  } catch {
    // No overlay or already dismissed.
  }
}

async function bindUdp(socket) {
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => resolve());
  });
  return socket.address().port;
}

async function setupUdpContact(page, port) {
  await page.click("#tab-connections-settings");
  await page.fill("#contact-name", "E2E UDP");
  await page.selectOption("#contact-protocol", "udp");
  await page.fill("#contact-host", "127.0.0.1");
  await page.fill("#contact-port", String(port));
  await page.click("#contact-save");
}

async function addButtonBoundToFirstContact(page) {
  await page.click("#tab-button-settings");
  await page.click("#add-button");
  const contactSelect = page.locator(".command select").first();
  await expect(contactSelect).toBeVisible();
  await contactSelect.selectOption({ index: 1 });
}

async function addButtons(page, count) {
  await page.click("#tab-button-settings");
  for (let i = 0; i < count; i += 1) {
    await page.click("#add-button");
  }
}

async function pressUndo(page) {
  const modKey = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modKey);
  await page.keyboard.press("Z");
  await page.keyboard.up(modKey);
}

async function pressRedo(page) {
  const modKey = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modKey);
  await page.keyboard.press("Shift+Z");
  await page.keyboard.up(modKey);
}

test("add button and execute UDP command chain", async () => {
  const probe = createUdpProbeServer();
  const port = await bindUdp(probe.socket);
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#grid");
    await dismissOnboardingIfVisible(page);
    await setupUdpContact(page, port);
    await addButtonBoundToFirstContact(page);
    await page.locator("#grid .user-btn").first().click();
    await page.click("#run-selected");

    const packet = await probe.packetPromise;
    expect(packet).toBe("PING");
    await expect(page.locator(".toast.success").last()).toContainText("sent");
  } finally {
    probe.socket.close();
    await app.close();
  }
});

test("shortcut toggles mode and number key runs button", async () => {
  const probe = createUdpProbeServer();
  const port = await bindUdp(probe.socket);
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#grid");
    await dismissOnboardingIfVisible(page);
    await setupUdpContact(page, port);
    await addButtonBoundToFirstContact(page);

    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(modKey);
    await page.keyboard.press("E");
    await page.keyboard.up(modKey);

    await expect(page.locator("body")).toHaveClass(/mode-use/);
    // Number shortcuts are ignored while focus is on INPUT/SELECT (e.g. command contact).
    await page.evaluate(() => {
      const el = document.activeElement;
      if (el && typeof el.blur === "function") el.blur();
    });
    await page.keyboard.press("1");

    const packet = await probe.packetPromise;
    expect(packet).toBe("PING");
  } finally {
    probe.socket.close();
    await app.close();
  }
});

test("save legacy v1 preset and load migrated preset", async () => {
  const fixture = JSON.parse(readFileSync(FIXTURE_V1, "utf8"));
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "qb-e2e-"));
  const presetPath = path.join(tmpDir, "migrated-v1.json");
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#grid");
    await dismissOnboardingIfVisible(page);
    const loadedVersion = await page.evaluate(
      async ({ fixture, presetPath }) => {
        const saveResult = await window.quickButtonApi.preset.save({
          path: presetPath,
          preset: fixture
        });
        const loaded = await window.quickButtonApi.preset.loadLast();
        const loadedPreset = loaded?.preset ?? loaded;
        return {
          savedPath: saveResult.path,
          version: loadedPreset.version,
          buttonId: loadedPreset.buttons?.[0]?.id ?? ""
        };
      },
      { fixture, presetPath }
    );
    expect(loadedVersion.savedPath).toBe(presetPath);
    expect(loadedVersion.version).toBe(5);
    expect(loadedVersion.buttonId).toBe("btn-v1-osc");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
    await app.close();
  }
});

test("undo/redo works after color change and drag", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#grid");
    await dismissOnboardingIfVisible(page);
    await addButtons(page, 1);
    const firstBtn = page.locator("#grid .user-btn").first();
    await firstBtn.click();
    const buttonId = await firstBtn.getAttribute("data-btn-id");
    expect(buttonId).toBeTruthy();

    await page.fill("#btn-bg", "#123456");
    await expect(firstBtn).toHaveCSS("background-color", "rgb(18, 52, 86)");
    await pressUndo(page);
    await expect(firstBtn).not.toHaveCSS("background-color", "rgb(18, 52, 86)");
    await pressRedo(page);
    await expect(firstBtn).toHaveCSS("background-color", "rgb(18, 52, 86)");

    const targetCell = page.locator('.cell[data-col="3"][data-row="2"]').first();
    await firstBtn.dragTo(targetCell);
    const movedPos = await page.evaluate((id) => {
      const btn = document.querySelector(`[data-btn-id="${id}"]`);
      const cell = btn?.closest(".cell");
      return cell ? { col: cell.getAttribute("data-col"), row: cell.getAttribute("data-row") } : null;
    }, buttonId);
    expect(movedPos).toEqual({ col: "3", row: "2" });
    await pressUndo(page);
    const undonePos = await page.evaluate((id) => {
      const btn = document.querySelector(`[data-btn-id="${id}"]`);
      const cell = btn?.closest(".cell");
      return cell ? { col: cell.getAttribute("data-col"), row: cell.getAttribute("data-row") } : null;
    }, buttonId);
    expect(undonePos).toEqual({ col: "1", row: "0" });
  } finally {
    await app.close();
  }
});

test("multi-select bulk color survives save and reload", async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "qb-e2e-"));
  const presetPath = path.join(tmpDir, "bulk-color.json");
  let app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#grid");
    await dismissOnboardingIfVisible(page);
    await addButtons(page, 2);

    const first = page.locator("#grid .user-btn").nth(0);
    const second = page.locator("#grid .user-btn").nth(1);
    await first.click();
    await page.keyboard.down("Shift");
    await second.click();
    await page.keyboard.up("Shift");
    await page.fill("#btn-bg", "#445566");
    await expect(first).toHaveCSS("background-color", "rgb(68, 85, 102)");
    await expect(second).toHaveCSS("background-color", "rgb(68, 85, 102)");

    await page.evaluate(
      async ({ presetPath }) => {
        const buttons = Array.from(document.querySelectorAll("#grid .user-btn")).map((el, idx) => {
          const cell = el.closest(".cell");
          const style = window.getComputedStyle(el);
          const toHex = (rgb) => {
            const m = String(rgb).match(/\d+/g) || ["0", "0", "0"];
            return `#${m
              .slice(0, 3)
              .map((v) => Number(v).toString(16).padStart(2, "0"))
              .join("")}`;
          };
          return {
            id: el.getAttribute("data-btn-id") || `btn-${idx + 1}`,
            label: el.textContent || `Btn ${idx + 1}`,
            style: {
              bgColor: toHex(style.backgroundColor),
              textColor: toHex(style.color),
              fontSize: Number.parseInt(style.fontSize, 10) || 13,
              radius: Number.parseInt(style.borderRadius, 10) || 8
            },
            position: {
              col: Number(cell?.getAttribute("data-col") || 0),
              row: Number(cell?.getAttribute("data-row") || 0)
            },
            commands: []
          };
        });
        const preset = {
          version: 5,
          ui: {
            mode: "edit",
            alwaysOnTop: true,
            clickThroughBackground: true,
            grid: { cols: 4, rows: 3 },
            buttonSize: { w: 72, h: 72 },
            gridBackground: { color: "#000000", opacity: 0.25 },
            service: { col: 0, row: 0, radius: 8, showInGrid: true },
            window: { x: 80, y: 80 }
          },
          settings: { onCommandError: "stop", toastEnabled: true },
          contacts: [],
          buttons
        };
        await window.quickButtonApi.preset.save({ path: presetPath, preset });
      },
      { presetPath }
    );
  } finally {
    await app.close();
  }

  app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#grid");
    await dismissOnboardingIfVisible(page);
    const first = page.locator("#grid .user-btn").nth(0);
    const second = page.locator("#grid .user-btn").nth(1);
    await expect(first).toHaveCSS("background-color", "rgb(68, 85, 102)");
    await expect(second).toHaveCSS("background-color", "rgb(68, 85, 102)");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
    await app.close();
  }
});

test("dirty close shows confirm and can be cancelled", async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#grid");
    await dismissOnboardingIfVisible(page);
    await addButtons(page, 1);
    await page.locator("#grid .user-btn").first().click();
    await page.fill("#btn-label", "Dirty");

    let confirmSeen = false;
    page.on("dialog", async (dialog) => {
      confirmSeen = true;
      await dialog.dismiss();
    });
    await page.locator('[data-service-action="close"]').first().click();
    await expect(page.locator(".toast.info").last()).toContainText("Unsaved changes");
    expect(confirmSeen).toBe(true);
    await expect(page.locator("#grid")).toBeVisible();
  } finally {
    await app.close();
  }
});
