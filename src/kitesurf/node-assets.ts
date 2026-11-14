/**
 * Node-specific asset & VM isolation helpers:
 * - Resolves `assets/wasm/*.wasm` and `assets/fonts/*` from disk relative to package root
 * - Provides `node:vm` isolated realm runner (`createNodeVmRunnerFactory`)
 * - Registers synchronous `esbuild.transformSync` when available in Node for arbitrary ESM modules.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { installBase64Polyfill } from "./shims/base64-polyfill.ts";
import { isWasmRegistered, registerWasmBytes } from "./shims/wasm-registry.ts";
import { createFontAssetsFetcher, type FontAssetsFetcher } from "./font-assets.ts";
import {
  ensureLoaderLexerReady,
  registerSyncEsmTranspiler,
  type ScriptRunnerFactory,
} from "./in-process-loader.ts";

let assetsRootCache: string | null = null;

function findPackageRoot(): string {
  if (assetsRootCache) return assetsRootCache;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "assets/wasm/kitesurf_core_bg.wasm"))) {
      assetsRootCache = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const cwdCandidate = process.cwd();
  if (existsSync(resolve(cwdCandidate, "assets/wasm/kitesurf_core_bg.wasm"))) {
    assetsRootCache = cwdCandidate;
    return cwdCandidate;
  }
  throw new Error(
    "Could not locate assets/wasm/kitesurf_core_bg.wasm. Run `npm run build:kitesurf` first.",
  );
}

let initPromise: Promise<void> | null = null;

export async function ensureNodeKitesurfAssets(): Promise<{ fontAssets: FontAssetsFetcher }> {
  const root = findPackageRoot();
  if (!initPromise) {
    initPromise = (async () => {
      installBase64Polyfill(Uint8Array);
      await ensureLoaderLexerReady();
      try {
        const req = createRequire(import.meta.url);
        const esb = req("esbuild") as {
          transformSync?: (src: string, opts: Record<string, unknown>) => { code: string };
        };
        if (typeof esb.transformSync === "function") {
          registerSyncEsmTranspiler(
            (src) =>
              esb.transformSync!(src, {
                format: "cjs",
                target: "esnext",
                define: { "import.meta.url": '""' },
              }).code,
          );
        }
      } catch {
        // Optional in bundled distributions without esbuild; pureJsEsmToCjs handles generated modules.
      }
      if (!isWasmRegistered()) {
        const [coreWasm, rendererWasm] = await Promise.all([
          readFile(resolve(root, "assets/wasm/kitesurf_core_bg.wasm")),
          readFile(resolve(root, "assets/wasm/renderer_core_bg.wasm")),
        ]);
        await registerWasmBytes({ coreWasm, rendererWasm });
      }
    })();
  }
  await initPromise;

  const fontAssets = createFontAssetsFetcher(async (filename) => {
    try {
      const data = await readFile(resolve(root, "assets/fonts", filename));
      return new Uint8Array(data);
    } catch {
      return null;
    }
  });

  return { fontAssets };
}

/**
 * Creates a fresh V8 `node:vm` context per Kitesurf isolate (`PageScript`, `PageRenderer`, `DedicatedWorker`)
 * so each page/renderer owns an isolated global scope (`window`, `document`, globals).
 */
export function createNodeVmRunnerFactory(): ScriptRunnerFactory {
  return ({ fetch: scopedFetch }) => {
    const sandbox: Record<string, unknown> = {
      URL,
      URLSearchParams,
      Headers,
      Request,
      Response,
      Blob: globalThis.Blob,
      File: globalThis.File,
      FormData: globalThis.FormData,
      DOMException: globalThis.DOMException,
      CustomEvent: globalThis.CustomEvent,
      CloseEvent: (globalThis as { CloseEvent?: unknown }).CloseEvent,
      ErrorEvent: (globalThis as { ErrorEvent?: unknown }).ErrorEvent,
      TextEncoder,
      TextDecoder,
      TextEncoderStream: globalThis.TextEncoderStream,
      TextDecoderStream: globalThis.TextDecoderStream,
      CompressionStream: globalThis.CompressionStream,
      DecompressionStream: globalThis.DecompressionStream,
      AbortController,
      AbortSignal,
      ReadableStream,
      WritableStream,
      TransformStream,
      Event,
      EventTarget,
      MessageChannel,
      MessagePort,
      crypto,
      performance,
      navigator: globalThis.navigator,
      console,
      setTimeout: (fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
        const h = setTimeout(fn, ms, ...rest);
        if (typeof (h as { unref?: () => void }).unref === "function") h.unref();
        return h;
      },
      clearTimeout,
      setInterval: (fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
        const h = setInterval(fn, ms, ...rest);
        if (typeof (h as { unref?: () => void }).unref === "function") h.unref();
        return h;
      },
      clearInterval,
      queueMicrotask,
      structuredClone,
      atob,
      btoa,
      WebAssembly: globalThis.WebAssembly,
      ArrayBuffer: globalThis.ArrayBuffer,
      DataView: globalThis.DataView,
      Uint8Array: globalThis.Uint8Array,
      Uint8ClampedArray: globalThis.Uint8ClampedArray,
      Int8Array: globalThis.Int8Array,
      Uint16Array: globalThis.Uint16Array,
      Int16Array: globalThis.Int16Array,
      Uint32Array: globalThis.Uint32Array,
      Int32Array: globalThis.Int32Array,
      Float32Array: globalThis.Float32Array,
      Float64Array: globalThis.Float64Array,
      fetch: scopedFetch,
    };
    const context = vm.createContext(sandbox);
    vm.runInContext(
      `
      globalThis.globalThis = globalThis;
      globalThis.self = globalThis;
      globalThis.window = globalThis;
      globalThis.__ksDefault = function(mod) {
        if (mod instanceof WebAssembly.Module || (mod && typeof mod === "object" && !("__esModule" in mod) && !("default" in mod))) {
          return mod;
        }
        return mod && mod.default !== undefined ? mod.default : mod;
      };
    `,
      context,
    );
    const vmUint8 = vm.runInContext("Uint8Array", context) as typeof Uint8Array;
    installBase64Polyfill(vmUint8);

    return {
      runModule(code, filename, cjsRequire, dynamicImport, moduleObj) {
        vm.runInContext(
          `(function(g, dyn) { g.__ksImport = dyn; })`,
          context,
        )(sandbox, dynamicImport);
        const wrapperSrc = `(function(require, exports, module, __filename, __ksImport, __ksDefault) {\n${code}\n})`;
        const fn = vm.runInContext(wrapperSrc, context, { filename }) as (
          r: (s: string) => unknown,
          e: Record<string, unknown>,
          m: { exports: Record<string, unknown> },
          f: string,
          d: (s: string) => Promise<unknown>,
          defFn: unknown,
        ) => void;
        const vmDefault = vm.runInContext("__ksDefault", context);
        fn(cjsRequire, moduleObj.exports, moduleObj, filename, dynamicImport, vmDefault);
      },
    };
  };
}
