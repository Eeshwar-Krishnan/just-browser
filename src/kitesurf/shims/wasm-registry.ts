/**
 * Shared registry holding compiled WebAssembly modules and raw WASM bytes
 * for Kitesurf's core and renderer WASM engines.
 * Populated either lazily via Node `fs/promises` or via user-supplied bytes/URLs in browsers.
 */

export interface WasmAssetBundle {
  coreWasmBytes: Uint8Array;
  coreWasmModule: WebAssembly.Module;
  rendererWasmBytes: Uint8Array;
  rendererWasmModule: WebAssembly.Module;
}

interface RegistryState {
  coreBytes: Uint8Array | null;
  coreModule: WebAssembly.Module | null;
  rendererBytes: Uint8Array | null;
  rendererModule: WebAssembly.Module | null;
}

const REGISTRY_KEY = "__JUST_BROWSER_WASM_REGISTRY__";

function getState(): RegistryState {
  const g = globalThis as unknown as Record<string, RegistryState | undefined>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = {
      coreBytes: null,
      coreModule: null,
      rendererBytes: null,
      rendererModule: null,
    };
  }
  return g[REGISTRY_KEY]!;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function registerWasmBytes(input: {
  coreWasm: Uint8Array | ArrayBuffer;
  rendererWasm: Uint8Array | ArrayBuffer;
}): Promise<WasmAssetBundle> {
  const state = getState();
  const coreBytes =
    input.coreWasm instanceof Uint8Array ? input.coreWasm : new Uint8Array(input.coreWasm);
  const rendererBytes =
    input.rendererWasm instanceof Uint8Array
      ? input.rendererWasm
      : new Uint8Array(input.rendererWasm);

  const [coreModule, rendererModule] = await Promise.all([
    WebAssembly.compile(toArrayBuffer(coreBytes)),
    WebAssembly.compile(toArrayBuffer(rendererBytes)),
  ]);

  state.coreBytes = coreBytes;
  state.coreModule = coreModule;
  state.rendererBytes = rendererBytes;
  state.rendererModule = rendererModule;

  (globalThis as { __KS_CORE_WASM_MODULE?: WebAssembly.Module }).__KS_CORE_WASM_MODULE =
    coreModule;
  (globalThis as { __KS_RENDERER_WASM_MODULE?: WebAssembly.Module }).__KS_RENDERER_WASM_MODULE =
    rendererModule;

  return {
    coreWasmBytes: coreBytes,
    coreWasmModule: coreModule,
    rendererWasmBytes: rendererBytes,
    rendererWasmModule: rendererModule,
  };
}

export function registerCompiledWasm(input: {
  coreModule: WebAssembly.Module;
  coreBytes?: Uint8Array;
  rendererModule: WebAssembly.Module;
  rendererBytes?: Uint8Array;
}): void {
  const state = getState();
  state.coreModule = input.coreModule;
  state.rendererModule = input.rendererModule;
  if (input.coreBytes) state.coreBytes = input.coreBytes;
  if (input.rendererBytes) state.rendererBytes = input.rendererBytes;
  (globalThis as { __KS_CORE_WASM_MODULE?: WebAssembly.Module }).__KS_CORE_WASM_MODULE =
    input.coreModule;
  (globalThis as { __KS_RENDERER_WASM_MODULE?: WebAssembly.Module }).__KS_RENDERER_WASM_MODULE =
    input.rendererModule;
}

export function isWasmRegistered(): boolean {
  const state = getState();
  return state.coreModule !== null && state.rendererModule !== null;
}

export function getCoreWasmBytes(): Uint8Array {
  const bytes = getState().coreBytes;
  if (!bytes) {
    throw new Error("Kitesurf core WASM bytes not loaded yet. Initialize just-browser first.");
  }
  return bytes;
}

export function getCoreWasmModule(): WebAssembly.Module {
  const mod = getState().coreModule;
  if (!mod) {
    throw new Error("Kitesurf core WebAssembly.Module not compiled yet.");
  }
  return mod;
}

export function getRendererWasmBytes(): Uint8Array {
  const bytes = getState().rendererBytes;
  if (!bytes) {
    throw new Error("Kitesurf renderer WASM bytes not loaded yet.");
  }
  return bytes;
}

export function getRendererWasmModule(): WebAssembly.Module {
  const mod = getState().rendererModule;
  if (!mod) {
    throw new Error("Kitesurf renderer WebAssembly.Module not compiled yet.");
  }
  return mod;
}
