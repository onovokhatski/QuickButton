import { describe, it, expect } from "vitest";
import {
  PRESET_SCHEMA_VERSION,
  migratePreset,
  detectPresetVersion,
  sanitizePreset,
  sanitizeCommand,
  sanitizeContact,
  validateCommand,
  clampInt,
  createDefaultPreset
} from "../src/shared/presetSchema.cjs";

describe("detectPresetVersion", () => {
  it("returns 0 for missing version", () => {
    expect(detectPresetVersion({})).toBe(0);
  });
  it("treats legacy '1.0' string as 1", () => {
    expect(detectPresetVersion({ version: "1.0" })).toBe(1);
  });
  it("respects numeric version", () => {
    expect(detectPresetVersion({ version: 2 })).toBe(2);
  });
});

describe("migratePreset", () => {
  it("migrates raw v0 to current schema", () => {
    const raw = { buttons: [{ id: "b1", style: { bgColor: "#000" } }] };
    const migrated = migratePreset(raw);
    expect(migrated.version).toBe(PRESET_SCHEMA_VERSION);
    expect(migrated.meta).toBeDefined();
    expect(migrated.buttons[0].style.wrapLabel).toBe(false);
  });

  it("migrates legacy '1.0' string preset", () => {
    const raw = { version: "1.0", buttons: [{ style: { bgColor: "#111" } }] };
    const migrated = migratePreset(raw);
    expect(migrated.version).toBe(PRESET_SCHEMA_VERSION);
    expect(migrated.buttons[0].style.wrapLabel).toBe(false);
  });

  it("does not downgrade current version", () => {
    const raw = { version: PRESET_SCHEMA_VERSION, buttons: [{ style: { wrapLabel: true } }] };
    const migrated = migratePreset(raw);
    expect(migrated.version).toBe(PRESET_SCHEMA_VERSION);
    expect(migrated.buttons[0].style.wrapLabel).toBe(true);
  });

  it("handles non-object gracefully", () => {
    const migrated = migratePreset(null);
    expect(migrated.version).toBe(PRESET_SCHEMA_VERSION);
  });
});

describe("sanitizePreset", () => {
  it("fills in defaults for empty input", () => {
    const result = sanitizePreset({});
    expect(result.version).toBe(PRESET_SCHEMA_VERSION);
    expect(result.meta.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.meta.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.ui.grid).toEqual({ cols: 4, rows: 3 });
    expect(result.buttons).toEqual([]);
    expect(result.contacts).toEqual([]);
  });

  it("clamps grid size to valid range", () => {
    const result = sanitizePreset({ ui: { grid: { cols: 999, rows: -5 } } });
    expect(result.ui.grid.cols).toBe(20);
    expect(result.ui.grid.rows).toBe(1);
  });

  it("preserves createdAt on round-trip", () => {
    const firstPass = sanitizePreset({ buttons: [] });
    const created = firstPass.meta.createdAt;
    const secondPass = sanitizePreset(firstPass);
    expect(secondPass.meta.createdAt).toBe(created);
    expect(secondPass.meta.updatedAt >= created).toBe(true);
  });

  it("normalizes invalid grid background color", () => {
    const result = sanitizePreset({ ui: { gridBackground: { color: "not-a-color", opacity: 2 } } });
    expect(result.ui.gridBackground.color).toBe("#000000");
    expect(result.ui.gridBackground.opacity).toBe(1);
  });

  it("keeps valid buttons and drops extras above limit", () => {
    const buttons = Array.from({ length: 200 }, (_, i) => ({ id: `b${i}`, label: `B${i}` }));
    const result = sanitizePreset({ buttons });
    expect(result.buttons.length).toBe(100);
    expect(result.buttons[0].id).toBe("b0");
  });
});

describe("sanitizeCommand", () => {
  it("defaults to udp when protocol missing", () => {
    const cmd = sanitizeCommand({});
    expect(cmd.protocol).toBe("udp");
    expect(cmd.target).toEqual({
      host: "127.0.0.1",
      port: 7000,
      persistent: false,
      keepAliveMs: 10000
    });
    expect(cmd.payload).toEqual({ type: "string", value: "" });
  });

  it("preserves OSC structure", () => {
    const cmd = sanitizeCommand({
      protocol: "osc-udp",
      osc: { address: "/volume", args: [{ type: "float", value: "0.5" }] }
    });
    expect(cmd.protocol).toBe("osc-udp");
    expect(cmd.osc.address).toBe("/volume");
    expect(cmd.osc.args[0]).toEqual({ type: "float", value: 0.5 });
  });

  it("prefers contactId over target when provided", () => {
    const cmd = sanitizeCommand({
      protocol: "udp",
      contactId: "c-1",
      target: { host: "1.2.3.4", port: 9000 }
    });
    expect(cmd.contactId).toBe("c-1");
    expect(cmd.target).toBeUndefined();
  });

  it("sanitizes delay command kind and range", () => {
    const cmd = sanitizeCommand({ kind: "delay", name: "Pause", delayMs: 999999 });
    expect(cmd.kind).toBe("delay");
    expect(cmd.delayMs).toBe(120000);
  });
});

describe("sanitizeContact", () => {
  it("assigns fallback id and name when missing", () => {
    const c = sanitizeContact({}, 3);
    expect(c.id).toBe("contact-4");
    expect(c.name).toBe("Contact 4");
    expect(c.protocol).toBe("udp");
  });

  it("clamps invalid port", () => {
    const c = sanitizeContact({ target: { host: "1.1.1.1", port: 99999 } }, 0);
    expect(c.target.port).toBe(65535);
  });
});

describe("validateCommand", () => {
  it("accepts a valid UDP command", () => {
    expect(
      validateCommand({
        protocol: "udp",
        target: { host: "1.1.1.1", port: 7000 },
        payload: { type: "string", value: "x" }
      })
    ).toBeNull();
  });

  it("rejects missing host", () => {
    expect(
      validateCommand({
        protocol: "udp",
        target: { host: "", port: 7000 },
        payload: { value: "x" }
      })
    ).toMatch(/host/i);
  });

  it("rejects invalid port", () => {
    expect(
      validateCommand({
        protocol: "udp",
        target: { host: "1.1.1.1", port: 70000 },
        payload: { value: "x" }
      })
    ).toMatch(/port/i);
  });

  it("rejects OSC without address", () => {
    expect(
      validateCommand({ protocol: "osc-udp", target: { host: "1.1.1.1", port: 7000 }, osc: {} })
    ).toMatch(/address/i);
  });

  it("allows contactId without target", () => {
    expect(
      validateCommand({ protocol: "udp", contactId: "c1", payload: { value: "x" } })
    ).toBeNull();
  });

  it("accepts valid delay command", () => {
    expect(validateCommand({ kind: "delay", delayMs: 750 })).toBeNull();
  });

  it("rejects invalid delay command range", () => {
    expect(validateCommand({ kind: "delay", delayMs: -1 })).toMatch(/delay/i);
  });
});

describe("clampInt", () => {
  it("clamps to bounds", () => {
    expect(clampInt(50, 0, 10, 5)).toBe(10);
    expect(clampInt(-1, 0, 10, 5)).toBe(0);
    expect(clampInt(3, 0, 10, 5)).toBe(3);
  });
  it("returns fallback on NaN", () => {
    expect(clampInt("abc", 0, 10, 5)).toBe(5);
  });
});

describe("createDefaultPreset", () => {
  it("produces a sanitizable preset", () => {
    const def = createDefaultPreset();
    const sanitized = sanitizePreset(def);
    expect(sanitized.version).toBe(PRESET_SCHEMA_VERSION);
    expect(sanitized.ui.grid.cols).toBe(def.ui.grid.cols);
  });
});
