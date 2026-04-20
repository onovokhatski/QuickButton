import { describe, it, expect } from "vitest";
import {
  padTo4,
  encodeOscString,
  encodeOscInt,
  encodeOscFloat,
  encodeOscArg,
  encodeOscPacket,
  decodeOscPacket,
  validateOscAddress
} from "../src/shared/oscCodec.cjs";

function hex(buf) {
  return Buffer.from(buf).toString("hex");
}

describe("padTo4", () => {
  it("returns same buffer when length is multiple of 4", () => {
    const b = Buffer.from([1, 2, 3, 4]);
    expect(hex(padTo4(b))).toBe("01020304");
  });

  it("pads 1 byte to 4", () => {
    expect(padTo4(Buffer.from([0x41])).length).toBe(4);
  });
});

describe("encodeOscString", () => {
  it("pads short string to 4-byte boundary", () => {
    expect(hex(encodeOscString("/a"))).toBe("2f610000");
  });

  it("pads /test (5 chars + null) to 8 bytes", () => {
    expect(encodeOscString("/test").length).toBe(8);
    expect(hex(encodeOscString("/test"))).toBe("2f74657374000000");
  });
});

describe("encodeOscInt", () => {
  it("encodes zero", () => {
    expect(hex(encodeOscInt(0))).toBe("00000000");
  });

  it("encodes 42 big-endian", () => {
    expect(hex(encodeOscInt(42))).toBe("0000002a");
  });

  it("encodes -1 as two's complement", () => {
    expect(hex(encodeOscInt(-1))).toBe("ffffffff");
  });
});

describe("encodeOscFloat", () => {
  it("encodes 1.0 IEEE754 BE", () => {
    expect(hex(encodeOscFloat(1))).toBe("3f800000");
  });

  it("encodes 0.5", () => {
    expect(hex(encodeOscFloat(0.5))).toBe("3f000000");
  });
});

describe("encodeOscArg", () => {
  it("maps int to tag i", () => {
    const r = encodeOscArg({ type: "int", value: 7 });
    expect(r.tag).toBe("i");
    expect(hex(r.data)).toBe("00000007");
  });

  it("maps bool true to T without data", () => {
    const r = encodeOscArg({ type: "bool", value: true });
    expect(r.tag).toBe("T");
    expect(r.data).toBeNull();
  });

  it("maps bool false to F without data", () => {
    const r = encodeOscArg({ type: "bool", value: false });
    expect(r.tag).toBe("F");
    expect(r.data).toBeNull();
  });

  it("rejects unknown type", () => {
    expect(() => encodeOscArg({ type: "blob", value: null })).toThrow(/Unsupported OSC arg type/);
  });
});

describe("validateOscAddress", () => {
  it("accepts /foo", () => {
    expect(validateOscAddress("/foo")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateOscAddress("")).toMatch(/non-empty/);
  });

  it("rejects address without leading slash", () => {
    expect(validateOscAddress("foo")).toMatch(/start with/);
  });

  it("rejects null byte in address", () => {
    expect(validateOscAddress("/bad\0x")).toMatch(/null/);
  });
});

describe("encodeOscPacket", () => {
  it("throws when args is not an array", () => {
    expect(() => encodeOscPacket({ address: "/x", args: null })).toThrow(/must be an array/);
  });

  it("throws when address invalid", () => {
    expect(() => encodeOscPacket({ address: "nope", args: [] })).toThrow(/start with/);
  });

  it("matches byte fixture: address /a, single int 42", () => {
    const buf = encodeOscPacket({ address: "/a", args: [{ type: "int", value: 42 }] });
    expect(hex(buf)).toBe("2f6100002c6900000000002a");
  });

  it("matches byte fixture: empty args (only comma in tag string)", () => {
    const buf = encodeOscPacket({ address: "/go", args: [] });
    expect(hex(buf)).toBe("2f676f002c000000");
  });

  it("encodes mixed int float string bool", () => {
    const buf = encodeOscPacket({
      address: "/mix",
      args: [
        { type: "int", value: 1 },
        { type: "float", value: 0.25 },
        { type: "string", value: "hi" },
        { type: "bool", value: true },
        { type: "bool", value: false }
      ]
    });
    const round = decodeOscPacket(buf);
    expect(round.address).toBe("/mix");
    expect(round.args).toEqual([
      { type: "int", value: 1 },
      { type: "float", value: 0.25 },
      { type: "string", value: "hi" },
      { type: "bool", value: true },
      { type: "bool", value: false }
    ]);
  });
});

describe("decodeOscPacket", () => {
  it("round-trips empty args", () => {
    const enc = encodeOscPacket({ address: "/ping", args: [] });
    expect(decodeOscPacket(enc)).toEqual({ address: "/ping", args: [] });
  });

  it("round-trips single float", () => {
    const enc = encodeOscPacket({ address: "/f", args: [{ type: "float", value: -3.5 }] });
    const dec = decodeOscPacket(enc);
    expect(dec.address).toBe("/f");
    expect(dec.args).toHaveLength(1);
    expect(dec.args[0].type).toBe("float");
    expect(dec.args[0].value).toBeCloseTo(-3.5, 5);
  });

  it("throws on truncated int", () => {
    const bad = Buffer.from("2f6100002c6900", "hex");
    expect(() => decodeOscPacket(bad)).toThrow();
  });

  it("throws on trailing garbage", () => {
    const good = encodeOscPacket({ address: "/x", args: [] });
    const bad = Buffer.concat([good, Buffer.from([1, 2, 3])]);
    expect(() => decodeOscPacket(bad)).toThrow(/trailing/);
  });

  it("throws on unsupported tag", () => {
    const bad = Buffer.concat([encodeOscString("/x"), encodeOscString(",b"), Buffer.alloc(0)]);
    expect(() => decodeOscPacket(bad)).toThrow(/Unsupported OSC type tag/);
  });
});

describe("fixture parity (TouchOSC-style /fire + int)", () => {
  it("matches frozen hex for /fire ,i 1", () => {
    const buf = encodeOscPacket({
      address: "/fire",
      args: [{ type: "int", value: 1 }]
    });
    expect(hex(buf)).toBe("2f666972650000002c69000000000001");
    expect(decodeOscPacket(buf)).toEqual({
      address: "/fire",
      args: [{ type: "int", value: 1 }]
    });
  });
});
