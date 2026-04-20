import { describe, it, expect } from "vitest";
import { PRESET_SCHEMA_VERSION, PresetVersionError, sanitizePreset } from "../src/shared/presetSchema.cjs";

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomString(rng, len = randomInt(rng, 0, 24)) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789_-";
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += chars[randomInt(rng, 0, chars.length - 1)];
  }
  return out;
}

function randomJsonLike(rng, depth = 0) {
  const leafRoll = rng();
  if (depth > 3 || leafRoll < 0.2) return null;
  if (leafRoll < 0.35) return rng() < 0.5;
  if (leafRoll < 0.5) return (rng() - 0.5) * 100000;
  if (leafRoll < 0.65) return randomString(rng);
  if (leafRoll < 0.8) {
    const arr = [];
    const count = randomInt(rng, 0, 8);
    for (let i = 0; i < count; i += 1) {
      arr.push(randomJsonLike(rng, depth + 1));
    }
    return arr;
  }
  const obj = {};
  const keys = randomInt(rng, 0, 10);
  for (let i = 0; i < keys; i += 1) {
    obj[randomString(rng, randomInt(rng, 1, 12))] = randomJsonLike(rng, depth + 1);
  }
  return obj;
}

function assertSanitizedShape(result) {
  expect(result.version).toBe(PRESET_SCHEMA_VERSION);
  expect(Array.isArray(result.buttons)).toBe(true);
  expect(Array.isArray(result.contacts)).toBe(true);
  expect(result.buttons.length).toBeLessThanOrEqual(100);
  expect(result.contacts.length).toBeLessThanOrEqual(200);
  expect(result.ui.grid.cols).toBeGreaterThanOrEqual(1);
  expect(result.ui.grid.cols).toBeLessThanOrEqual(20);
  expect(result.ui.grid.rows).toBeGreaterThanOrEqual(1);
  expect(result.ui.grid.rows).toBeLessThanOrEqual(20);
  expect(result.ui.buttonSize.w).toBeGreaterThanOrEqual(16);
  expect(result.ui.buttonSize.w).toBeLessThanOrEqual(160);
  expect(result.ui.buttonSize.h).toBeGreaterThanOrEqual(16);
  expect(result.ui.buttonSize.h).toBeLessThanOrEqual(160);
  expect(result.ui.gridBackground.opacity).toBeGreaterThanOrEqual(0);
  expect(result.ui.gridBackground.opacity).toBeLessThanOrEqual(1);
  expect(["edit", "use"]).toContain(result.ui.mode);
}

describe("sanitizePreset fuzz/property", () => {
  it("returns sanitized output for random object-like inputs", () => {
    const rng = mulberry32(0xc0ffee);
    for (let i = 0; i < 500; i += 1) {
      const raw = randomJsonLike(rng);
      const input =
        raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw, version: randomInt(rng, 0, 5) } : {};
      const result = sanitizePreset(input);
      assertSanitizedShape(result);
    }
  });

  it("throws explicit PresetVersionError for future schema version", () => {
    const raw = { version: PRESET_SCHEMA_VERSION + 1, buttons: [] };
    expect(() => sanitizePreset(raw)).toThrow(PresetVersionError);
    try {
      sanitizePreset(raw);
    } catch (error) {
      expect(error.code).toBe("PRESET_VERSION_UNSUPPORTED");
    }
  });
});
