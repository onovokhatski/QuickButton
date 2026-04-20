import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  PRESET_SCHEMA_VERSION,
  PresetVersionError,
  migratePreset,
  detectPresetVersion,
  sanitizePreset
} from "../src/shared/presetSchema.cjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(HERE, "fixtures");

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

// Use a fixed "now" so snapshots of sanitizePreset output are deterministic
// without coupling to wall clock.
const FIXED_NOW = new Date("2025-04-19T12:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("preset migrations — fixtures", () => {
  const FIXTURES = ["preset.v0.json", "preset.v1.json", "preset.v2.json", "preset.v3.json"];

  it.each([
    ["preset.v0.json", 0],
    ["preset.v1.json", 1],
    ["preset.v2.json", 2],
    ["preset.v3.json", 3]
  ])("detects version from %s", (file, expected) => {
    expect(detectPresetVersion(loadFixture(file))).toBe(expected);
  });

  it.each(FIXTURES)("migrates %s to current schema", (file) => {
    const migrated = migratePreset(loadFixture(file));
    expect(migrated.version).toBe(PRESET_SCHEMA_VERSION);
  });

  it("v0 fixture: sanitize produces stable snapshot", () => {
    const result = sanitizePreset(loadFixture("preset.v0.json"));
    expect(result).toMatchSnapshot();
  });

  it("v1 fixture: sanitize produces stable snapshot", () => {
    const result = sanitizePreset(loadFixture("preset.v1.json"));
    expect(result).toMatchSnapshot();
  });

  it("v2 fixture: sanitize produces stable snapshot", () => {
    const result = sanitizePreset(loadFixture("preset.v2.json"));
    expect(result).toMatchSnapshot();
  });

  it("v3 fixture: sanitize produces stable snapshot", () => {
    const result = sanitizePreset(loadFixture("preset.v3.json"));
    expect(result).toMatchSnapshot();
  });

  it("sanitize is idempotent across all fixtures", () => {
    for (const file of FIXTURES) {
      const once = sanitizePreset(loadFixture(file));
      const twice = sanitizePreset(once);
      expect(twice).toEqual({ ...once, meta: { ...once.meta, updatedAt: twice.meta.updatedAt } });
      expect(twice.meta.createdAt).toBe(once.meta.createdAt);
    }
  });

  it("preserves key fields from v1 fixture through migration + sanitize", () => {
    const result = sanitizePreset(loadFixture("preset.v1.json"));
    expect(result.buttons).toHaveLength(1);
    const btn = result.buttons[0];
    expect(btn.id).toBe("btn-v1-osc");
    expect(btn.label).toBe("Fire OSC");
    expect(btn.commands[0].protocol).toBe("osc-udp");
    expect(btn.commands[0].osc.address).toBe("/fire");
    expect(btn.commands[0].osc.args).toEqual([
      { type: "int", value: 1 },
      { type: "float", value: 0.75 },
      { type: "string", value: "go" }
    ]);
    expect(btn.style.wrapLabel).toBeUndefined();
    expect(btn.style.iconDarken).toBe(35);
    expect(btn.style.labelVisibility).toBe("always");
  });

  it("preserves v2 wrapLabel and adds v3 fields", () => {
    const result = sanitizePreset(loadFixture("preset.v2.json"));
    const btn = result.buttons[0];
    expect(btn.style.wrapLabel).toBe(true);
    expect(btn.style.iconDarken).toBe(35);
    expect(btn.style.labelVisibility).toBe("always");
    expect(btn.commands[0].contactId).toBe("contact-v2-1");
    expect(result.contacts).toHaveLength(1);
  });

  it("keeps legacy iconPath on v3 fixture (to be hydrated by main)", () => {
    const result = sanitizePreset(loadFixture("preset.v3.json"));
    const btn = result.buttons[0];
    expect(btn.style.iconDarken).toBe(45);
    expect(btn.style.labelVisibility).toBe("hover");
    expect(btn.style.iconPath).toBe("/var/folders/fake/cam1.png");
    expect(btn.style.iconAssetId).toBeUndefined();
    expect(btn.commands[0].payload).toEqual({ type: "hex", value: "0x01 0x02 0xff" });
  });

  it("accepts v4 fixture with iconAssetId and drops iconPath if both present", () => {
    const input = {
      version: 4,
      buttons: [
        {
          id: "b",
          label: "B",
          style: {
            iconAssetId: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
            iconPath: "/should/not/leak.png",
            iconDarken: 20,
            labelVisibility: "always"
          },
          position: { col: 0, row: 0 },
          commands: []
        }
      ]
    };
    const result = sanitizePreset(input);
    const btn = result.buttons[0];
    expect(btn.style.iconAssetId).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(btn.style.iconPath).toBeUndefined();
  });

  it("rejects malformed iconAssetId", () => {
    const input = {
      version: 4,
      buttons: [
        {
          id: "b",
          label: "B",
          style: {
            iconAssetId: "../../evil",
            iconDarken: 35,
            labelVisibility: "always"
          },
          position: { col: 0, row: 0 },
          commands: []
        }
      ]
    };
    const result = sanitizePreset(input);
    const btn = result.buttons[0];
    expect(btn.style.iconAssetId).toBeUndefined();
  });
});

describe("forward-version protection", () => {
  it("throws PresetVersionError when file version is newer than supported", () => {
    const futurePreset = { version: PRESET_SCHEMA_VERSION + 1, buttons: [] };
    expect(() => migratePreset(futurePreset)).toThrowError(PresetVersionError);
    try {
      migratePreset(futurePreset);
    } catch (err) {
      expect(err).toBeInstanceOf(PresetVersionError);
      expect(err.code).toBe("PRESET_VERSION_UNSUPPORTED");
      expect(err.fileVersion).toBe(PRESET_SCHEMA_VERSION + 1);
      expect(err.supportedVersion).toBe(PRESET_SCHEMA_VERSION);
    }
  });

  it("sanitizePreset propagates PresetVersionError", () => {
    expect(() => sanitizePreset({ version: PRESET_SCHEMA_VERSION + 5 })).toThrowError(
      PresetVersionError
    );
  });

  it("does NOT throw when version equals current", () => {
    expect(() => migratePreset({ version: PRESET_SCHEMA_VERSION })).not.toThrow();
  });

  it("does NOT throw on missing / legacy versions (forward path only)", () => {
    expect(() => migratePreset({})).not.toThrow();
    expect(() => migratePreset({ version: "1.0" })).not.toThrow();
  });
});
