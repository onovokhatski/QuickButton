import { describe, it, expect } from "vitest";
import { CHANNELS, SCHEMAS, validatePayload } from "../src/shared/ipc.cjs";

describe("validatePayload", () => {
  it("keeps channel-to-schema contract explicit", () => {
    const expectedSchemaChannels = [
      CHANNELS.windowSetAlwaysOnTop,
      CHANNELS.windowSetContentSize,
      CHANNELS.windowSetIgnoreMouseEvents,
      CHANNELS.dialogPickIconFile,
      CHANNELS.menuSetShowServiceInGrid,
      CHANNELS.runtimeExecuteChain,
      CHANNELS.diagnosticsReportError
    ].sort();
    const schemaChannels = Object.keys(SCHEMAS).sort();
    expect(schemaChannels).toEqual(expectedSchemaChannels);

    const channelValues = new Set(Object.values(CHANNELS));
    for (const schemaChannel of schemaChannels) {
      expect(channelValues.has(schemaChannel)).toBe(true);
    }
  });

  it("passes through channels without schema", () => {
    const res = validatePayload("unknown:channel", { any: "thing" });
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({ any: "thing" });
  });

  it("accepts valid windowSetAlwaysOnTop", () => {
    const res = validatePayload(CHANNELS.windowSetAlwaysOnTop, { value: true });
    expect(res.ok).toBe(true);
    expect(res.value).toEqual({ value: true });
  });

  it("rejects missing boolean", () => {
    const res = validatePayload(CHANNELS.windowSetAlwaysOnTop, {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/value/);
  });

  it("coerces numeric strings for windowSetContentSize", () => {
    const res = validatePayload(CHANNELS.windowSetContentSize, { width: "420", height: 300 });
    expect(res.ok).toBe(true);
    expect(res.value.width).toBe(420);
  });

  it("rejects out-of-range size", () => {
    const res = validatePayload(CHANNELS.windowSetContentSize, { width: 10, height: 300 });
    expect(res.ok).toBe(false);
  });

  it("applies default for optional forward flag", () => {
    const res = validatePayload(CHANNELS.windowSetIgnoreMouseEvents, { ignore: true });
    expect(res.ok).toBe(true);
    expect(res.value.forward).toBe(false);
  });

  it("rejects runtimeExecuteChain with invalid onError", () => {
    const res = validatePayload(CHANNELS.runtimeExecuteChain, { chain: [], onError: "bogus" });
    expect(res.ok).toBe(false);
  });

  it("accepts runtimeExecuteChain with defaults", () => {
    const res = validatePayload(CHANNELS.runtimeExecuteChain, { chain: [] });
    expect(res.ok).toBe(true);
    expect(res.value.onError).toBe("stop");
  });

  it("rejects runtimeExecuteChain when chain is not array", () => {
    const res = validatePayload(CHANNELS.runtimeExecuteChain, { chain: "oops" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/chain/i);
  });

  it("rejects too long dialogPickIconFile path", () => {
    const res = validatePayload(CHANNELS.dialogPickIconFile, {
      currentPath: "x".repeat(1025)
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/currentPath/i);
  });

  it("rejects diagnostics sessionId that is too long", () => {
    const res = validatePayload(CHANNELS.diagnosticsReportError, {
      sessionId: "s".repeat(100),
      message: "x"
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sessionId/i);
  });

  it("rejects invalid payloads for each schema-bound channel", () => {
    const oversized = "x".repeat(2001);
    const invalidCases = [
      [CHANNELS.windowSetAlwaysOnTop, { value: undefined }],
      [CHANNELS.windowSetContentSize, { width: 100, height: 300 }],
      [CHANNELS.windowSetIgnoreMouseEvents, { forward: true }],
      [CHANNELS.dialogPickIconFile, "not-an-object"],
      [CHANNELS.menuSetShowServiceInGrid, {}],
      [CHANNELS.runtimeExecuteChain, { chain: [], onError: "invalid" }],
      [CHANNELS.diagnosticsReportError, { message: oversized }]
    ];
    invalidCases.forEach(([channel, payload]) => {
      const res = validatePayload(channel, payload);
      expect(res.ok).toBe(false);
    });
  });
});
