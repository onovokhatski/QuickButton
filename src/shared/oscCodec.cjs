/**
 * OSC 1.0 encoding (subset) for QuickButton UDP sends.
 * Pure Buffer-based; safe to run from Node (main process) and Vitest.
 */

const { Buffer } = require("node:buffer");

function padTo4(buffer) {
  const remainder = buffer.length % 4;
  if (remainder === 0) {
    return buffer;
  }
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder)]);
}

function encodeOscString(value) {
  return padTo4(Buffer.concat([Buffer.from(String(value), "utf8"), Buffer.from([0])]));
}

function encodeOscInt(value) {
  const out = Buffer.alloc(4);
  out.writeInt32BE(Number(value), 0);
  return out;
}

function encodeOscFloat(value) {
  const out = Buffer.alloc(4);
  out.writeFloatBE(Number(value), 0);
  return out;
}

function encodeOscArg(arg) {
  if (arg.type === "int") {
    return { tag: "i", data: encodeOscInt(arg.value) };
  }
  if (arg.type === "float") {
    return { tag: "f", data: encodeOscFloat(arg.value) };
  }
  if (arg.type === "string") {
    return { tag: "s", data: encodeOscString(arg.value) };
  }
  if (arg.type === "bool") {
    return { tag: arg.value ? "T" : "F", data: null };
  }
  throw new Error(`Unsupported OSC arg type: ${arg.type}`);
}

/**
 * @param {string} address
 * @returns {string|null} error message or null if ok
 */
function validateOscAddress(address) {
  if (typeof address !== "string" || address.length === 0) {
    return "OSC address must be a non-empty string";
  }
  if (!address.startsWith("/")) {
    return "OSC address must start with /";
  }
  if (address.includes("\0")) {
    return "OSC address must not contain null bytes";
  }
  return null;
}

function encodeOscPacket(osc) {
  const addrErr = validateOscAddress(osc?.address);
  if (addrErr) {
    throw new Error(addrErr);
  }
  if (!Array.isArray(osc.args)) {
    throw new Error("OSC args must be an array");
  }

  const encodedArgs = osc.args.map(encodeOscArg);
  const tags = `,${encodedArgs.map((item) => item.tag).join("")}`;
  const parts = [encodeOscString(osc.address), encodeOscString(tags)];

  for (const item of encodedArgs) {
    if (item.data) {
      parts.push(item.data);
    }
  }
  return Buffer.concat(parts);
}

/**
 * Read a null-terminated OSC string padded to 4 bytes.
 * @param {Buffer} buf
 * @param {number} offset
 * @returns {{ value: string, next: number }}
 */
function readOscString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) {
    end += 1;
  }
  const value = buf.toString("utf8", offset, end);
  end += 1;
  const len = end - offset;
  const padded = len + ((4 - (len % 4)) % 4);
  return { value, next: offset + padded };
}

/**
 * Decode a packet produced by encodeOscPacket (same subset: i, f, s, T, F).
 * @param {Buffer} buf
 * @returns {{ address: string, args: Array<{ type: string, value: unknown }> }}
 */
function decodeOscPacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) {
    throw new Error("OSC packet too short");
  }
  let off = 0;
  const a = readOscString(buf, off);
  off = a.next;
  const address = a.value;
  const addrErr = validateOscAddress(address);
  if (addrErr) {
    throw new Error(addrErr);
  }
  const t = readOscString(buf, off);
  off = t.next;
  const tagStr = t.value;
  if (!tagStr.startsWith(",")) {
    throw new Error("OSC type tag string must start with ,");
  }
  const args = [];
  for (let i = 1; i < tagStr.length; i += 1) {
    const ch = tagStr[i];
    if (ch === "i") {
      if (off + 4 > buf.length) {
        throw new Error("truncated OSC int");
      }
      args.push({ type: "int", value: buf.readInt32BE(off) });
      off += 4;
    } else if (ch === "f") {
      if (off + 4 > buf.length) {
        throw new Error("truncated OSC float");
      }
      args.push({ type: "float", value: buf.readFloatBE(off) });
      off += 4;
    } else if (ch === "s") {
      const s = readOscString(buf, off);
      args.push({ type: "string", value: s.value });
      off = s.next;
    } else if (ch === "T") {
      args.push({ type: "bool", value: true });
    } else if (ch === "F") {
      args.push({ type: "bool", value: false });
    } else {
      throw new Error(`Unsupported OSC type tag: ${ch}`);
    }
  }
  if (off !== buf.length) {
    throw new Error(`trailing bytes after OSC message (${buf.length - off} bytes)`);
  }
  return { address, args };
}

module.exports = {
  padTo4,
  encodeOscString,
  encodeOscInt,
  encodeOscFloat,
  encodeOscArg,
  encodeOscPacket,
  decodeOscPacket,
  validateOscAddress
};
