// Lazy placeholder for static `.wasm` import inside engine `wasm.ts`.
// `wasm.ts` falls back to `globalThis.__KS_CORE_WASM_MODULE` once `registerWasmBytes` runs.
export default undefined as unknown as WebAssembly.Module;
