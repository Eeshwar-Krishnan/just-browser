/**
 * Pure-JS polyfill for TC39 `Uint8Array.fromBase64` and `Uint8Array.prototype.toBase64`.
 * Kitesurf relies on these (native in V8/Cloudflare Workers & Node >= 25),
 * which are absent in Node 20 and some browsers.
 */

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const STD_LOOKUP = new Int16Array(256).fill(-1);
for (let i = 0; i < BASE64_CHARS.length; i++) {
  STD_LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;
}
STD_LOOKUP["=".charCodeAt(0)] = -2;

const URL_LOOKUP = new Int16Array(256).fill(-1);
for (let i = 0; i < URL_CHARS.length; i++) {
  URL_LOOKUP[URL_CHARS.charCodeAt(i)] = i;
}
URL_LOOKUP["=".charCodeAt(0)] = -2;

export interface FromBase64Options {
  alphabet?: "base64" | "base64url";
  lastChunkHandling?: "loose" | "strict" | "stop-before-partial";
}

export interface ToBase64Options {
  alphabet?: "base64" | "base64url";
  omitPadding?: boolean;
}

export function uint8ArrayToBase64(bytes: Uint8Array, options?: ToBase64Options): string {
  const alphabet = options?.alphabet === "base64url" ? URL_CHARS : BASE64_CHARS;
  const omitPadding = options?.omitPadding === true;
  const len = bytes.length;
  let out = "";
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      alphabet[(n >>> 18) & 63]! +
      alphabet[(n >>> 12) & 63]! +
      alphabet[(n >>> 6) & 63]! +
      alphabet[n & 63]!;
  }
  const rem = len - i;
  if (rem === 1) {
    const n = bytes[i]!;
    out += alphabet[n >>> 2]! + alphabet[(n & 3) << 4]!;
    if (!omitPadding) out += "==";
  } else if (rem === 2) {
    const n = (bytes[i]! << 8) | bytes[i + 1]!;
    out += alphabet[n >>> 10]! + alphabet[(n >>> 4) & 63]! + alphabet[(n & 15) << 2]!;
    if (!omitPadding) out += "=";
  }
  return out;
}

export function uint8ArrayFromBase64(
  input: string,
  options?: FromBase64Options,
): Uint8Array<ArrayBuffer> {
  if (typeof input !== "string") {
    throw new TypeError("Uint8Array.fromBase64: input must be a string");
  }
  const lookup = options?.alphabet === "base64url" ? URL_LOOKUP : STD_LOOKUP;
  const cleaned = input.replace(/[\t\n\f\r ]+/g, "");
  let pad = 0;
  let end = cleaned.length;
  while (end > 0 && cleaned[end - 1] === "=") {
    pad++;
    end--;
  }
  if (pad > 2) {
    throw new SyntaxError("Invalid base64 padding");
  }
  const dataLen = end;
  const rem = dataLen % 4;
  if (rem === 1) {
    throw new SyntaxError("Invalid base64 length");
  }
  const outLen = Math.floor((dataLen * 3) / 4);
  const buffer = new ArrayBuffer(outLen);
  const out = new Uint8Array(buffer);
  let outIdx = 0;
  let i = 0;
  for (; i + 3 < dataLen; i += 4) {
    const c0 = lookup[cleaned.charCodeAt(i)] ?? -1;
    const c1 = lookup[cleaned.charCodeAt(i + 1)] ?? -1;
    const c2 = lookup[cleaned.charCodeAt(i + 2)] ?? -1;
    const c3 = lookup[cleaned.charCodeAt(i + 3)] ?? -1;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new SyntaxError("Invalid base64 character");
    }
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out[outIdx++] = (n >>> 16) & 0xff;
    out[outIdx++] = (n >>> 8) & 0xff;
    out[outIdx++] = n & 0xff;
  }
  if (rem === 2) {
    const c0 = lookup[cleaned.charCodeAt(i)] ?? -1;
    const c1 = lookup[cleaned.charCodeAt(i + 1)] ?? -1;
    if (c0 < 0 || c1 < 0) throw new SyntaxError("Invalid base64 character");
    out[outIdx++] = (c0 << 2) | (c1 >>> 4);
  } else if (rem === 3) {
    const c0 = lookup[cleaned.charCodeAt(i)] ?? -1;
    const c1 = lookup[cleaned.charCodeAt(i + 1)] ?? -1;
    const c2 = lookup[cleaned.charCodeAt(i + 2)] ?? -1;
    if (c0 < 0 || c1 < 0 || c2 < 0) throw new SyntaxError("Invalid base64 character");
    out[outIdx++] = (c0 << 2) | (c1 >>> 4);
    out[outIdx++] = ((c1 & 0x0f) << 4) | (c2 >>> 2);
  }
  return out;
}

export function installBase64Polyfill(target: typeof Uint8Array = Uint8Array): void {
  const ctor = target as unknown as {
    fromBase64?: typeof uint8ArrayFromBase64;
  };
  if (typeof ctor.fromBase64 !== "function") {
    Object.defineProperty(target, "fromBase64", {
      value: uint8ArrayFromBase64,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
  const proto = target.prototype as unknown as {
    toBase64?: (options?: ToBase64Options) => string;
  };
  if (typeof proto.toBase64 !== "function") {
    Object.defineProperty(target.prototype, "toBase64", {
      value: function toBase64(this: Uint8Array, options?: ToBase64Options): string {
        return uint8ArrayToBase64(this, options);
      },
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
}

installBase64Polyfill(Uint8Array);
