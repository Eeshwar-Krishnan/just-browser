/**
 * Shim for `node:fs` used inside `@kitesurf/engine`'s `loadWasmBytesFromVfs()`.
 * Instead of reading from Cloudflare's `/bundle/*.wasm` VFS, serves bytes from
 * `wasm-registry.ts`.
 */

import { getCoreWasmBytes, getRendererWasmBytes } from "./wasm-registry.ts";

function lookupWasmArrayBuffer(filePath: unknown): ArrayBuffer | null {
  if (typeof filePath !== "string") return null;
  if (filePath.includes("renderer_core_bg.wasm") || filePath.includes("renderer")) {
    const b = getRendererWasmBytes();
    const copy = new Uint8Array(b.byteLength);
    copy.set(b);
    return copy.buffer;
  }
  if (filePath.includes("kitesurf_core_bg.wasm") || filePath.endsWith(".wasm")) {
    const b = getCoreWasmBytes();
    const copy = new Uint8Array(b.byteLength);
    copy.set(b);
    return copy.buffer;
  }
  return null;
}

export function readdirSync(dirPath: unknown): string[] {
  if (typeof dirPath === "string" && dirPath.includes("bundle")) {
    return ["kitesurf_core_bg.wasm", "renderer_core_bg.wasm"];
  }
  return [];
}

export function existsSync(filePath: unknown): boolean {
  return lookupWasmArrayBuffer(filePath) !== null;
}

export function readFileSync(filePath: unknown): Uint8Array {
  const buf = lookupWasmArrayBuffer(filePath);
  if (buf) return new Uint8Array(buf);
  throw new Error(`vfs-fs-shim: unsupported readFileSync path ${String(filePath)}`);
}

export default {
  readdirSync,
  existsSync,
  readFileSync,
};
