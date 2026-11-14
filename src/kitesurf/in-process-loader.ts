/**
 * In-process implementation of Cloudflare's `WorkerLoader` (`env.LOADER`) for Kitesurf.
 *
 * Pre-compiled CJS bundles (`KITESURF_CJS_BUNDLES`) execute inside per-isolate
 * scopes (`node:vm` Context in Node via injected ScriptRunner, or isolated scope
 * wrapper in browsers) with zero subprocesses or `workerd` daemon required.
 */

import { init as initLexer, parse as parseModuleLexer } from "es-module-lexer";
import { installBase64Polyfill } from "./shims/base64-polyfill.ts";
import { WorkerEntrypoint, RpcTarget, abortIsolate } from "./shims/cloudflare-workers.ts";
import { getCoreWasmModule, getRendererWasmModule } from "./shims/wasm-registry.ts";

export interface ScriptRunner {
  /** Execute a CJS module source inside this isolate's realm. */
  runModule(
    code: string,
    filename: string,
    cjsRequire: (specifier: string) => unknown,
    dynamicImport: (specifier: string) => Promise<unknown>,
    moduleObj: { exports: Record<string, unknown> },
  ): void;
  /** Initialize a fresh realm/context helper (optional). */
  installHelpers?(): void;
  /** Tear down this isolate's context if supported. */
  dispose?(): void;
}

export type ScriptRunnerFactory = (globals: {
  fetch: typeof fetch;
  onAbort?: (reason: unknown) => void;
}) => ScriptRunner;

export type SyncEsmTranspiler = (esmCode: string) => string;

let optionalSyncTranspiler: SyncEsmTranspiler | null = null;
let lexerInitialized = false;

export async function ensureLoaderLexerReady(): Promise<void> {
  if (!lexerInitialized) {
    await initLexer;
    lexerInitialized = true;
  }
}

export function registerSyncEsmTranspiler(fn: SyncEsmTranspiler): void {
  optionalSyncTranspiler = fn;
}

/** Normalize cross-realm typed arrays/buffers to host Realm Uint8Array so `instanceof Uint8Array` holds. */
export function normalizeCrossRealmValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") return value;
  const obj = value as unknown as object;
  if (seen.has(obj)) return seen.get(obj) as T;

  if (ArrayBuffer.isView(obj)) {
    if (obj instanceof Uint8Array) return value;
    const view = obj as ArrayBufferView;
    const src = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const copy = new Uint8Array(view.byteLength);
    copy.set(src);
    return copy as unknown as T;
  }

  if (obj instanceof ArrayBuffer || Object.prototype.toString.call(obj) === "[object ArrayBuffer]") {
    const ab = obj as ArrayBuffer;
    const copy = new Uint8Array(new Uint8Array(ab)).buffer;
    return copy as unknown as T;
  }

  if (typeof obj === "function") {
    return wrapCrossRealmCallable(obj as unknown as (...args: unknown[]) => unknown) as unknown as T;
  }

  // Leave complex built-ins (Promise, WebAssembly, Error, Map, Set, ReadableStream, etc.) intact,
  // except recurse into plain arrays/objects so nested `.bytes` etc. get normalized.
  if (Array.isArray(obj)) {
    let changed = false;
    const out = obj.map((item) => {
      const n = normalizeCrossRealmValue(item, seen);
      if (n !== item) changed = true;
      return n;
    });
    return (changed ? out : obj) as unknown as T;
  }

  const proto = Object.getPrototypeOf(obj);
  if (proto === null || proto === Object.prototype || (proto?.constructor?.name === "Object")) {
    // Mutate/shallow copy only plain objects if a child changed, or preserve object identity for RPC targets
    const target = obj as Record<string, unknown>;
    seen.set(obj, target);
    for (const key of Object.keys(target)) {
      const v = target[key];
      if (v && typeof v === "object") {
        if (ArrayBuffer.isView(v) && !(v instanceof Uint8Array)) {
          const view = v as ArrayBufferView;
          const src = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
          const copy = new Uint8Array(view.byteLength);
          copy.set(src);
          target[key] = copy;
        } else if (
          Object.prototype.toString.call(v) === "[object ArrayBuffer]" &&
          !(v instanceof ArrayBuffer)
        ) {
          target[key] = new Uint8Array(new Uint8Array(v as ArrayBuffer)).buffer;
        } else {
          const protoChild = Object.getPrototypeOf(v);
          if (
            Array.isArray(v) ||
            protoChild === null ||
            protoChild === Object.prototype ||
            protoChild?.constructor?.name === "Object"
          ) {
            normalizeCrossRealmValue(v, seen);
          }
        }
      }
    }
    return value;
  }

  return value;
}

function wrapCrossRealmCallable(
  fn: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  return function crossRealmProxy(this: unknown, ...args: unknown[]) {
    const res = Reflect.apply(fn, this, args);
    if (res && typeof (res as Promise<unknown>).then === "function") {
      return (res as Promise<unknown>).then((resolved) => normalizeCrossRealmValue(resolved));
    }
    return normalizeCrossRealmValue(res);
  };
}

/** Wrap an object's methods so Promises and returned binary buffers normalize to host Realm cleanly. */
function wrapEntrypointObject<T extends Record<string, unknown>>(instance: T): T {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === "function") {
        return function wrappedMethod(this: unknown, ...args: unknown[]) {
          const res = Reflect.apply(val, target, args);
          if (res && typeof (res as Promise<unknown>).then === "function") {
            return (res as Promise<unknown>).then((resolved) => normalizeCrossRealmValue(resolved));
          }
          return normalizeCrossRealmValue(res);
        };
      }
      return val;
    },
  });
}

function rewriteDynamicImports(code: string): string {
  if (!lexerInitialized) return code;
  try {
    const [imports] = parseModuleLexer(code);
    const dynSites = imports.filter((i) => i.d >= 0).sort((a, b) => b.ss - a.ss);
    let out = code;
    for (const site of dynSites) {
      if (out.slice(site.ss, site.ss + 6) === "import") {
        out = out.slice(0, site.ss) + "globalThis.__ksImport" + out.slice(site.ss + 6);
      }
    }
    return out;
  } catch {
    return code;
  }
}

/**
 * Pure-JS fallback ESM -> CJS converter covering Kitesurf's generated modules
 * (`__ks_startup_probe_input.js`, `__ks_import_map.js`, `__ks_wasm_registry.js`, `__ks_entry.js`).
 */
export function pureJsEsmToCjs(esmCode: string): string {
  let code = rewriteDynamicImports(esmCode);

  // `export * from "mod";`
  code = code.replace(
    /^\s*export\s+\*\s+from\s+(['"][^'"]+['"])\s*;?/gm,
    (_m, spec) => `Object.assign(exports, require(${spec}));`,
  );

  // `export { a, b as c } from "mod";`
  code = code.replace(
    /^\s*export\s*\{([^}]+)\}\s*from\s+(['"][^'"]+['"])\s*;?/gm,
    (_m, specifiers: string, modSpec: string) => {
      const modVar = `__reexp_${Math.random().toString(36).slice(2, 8)}`;
      const assigns = specifiers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((part) => {
          const [orig, alias] = part.split(/\s+as\s+/).map((x) => x.trim());
          const outName = alias || orig!;
          if (orig === "default") {
            return `exports[${JSON.stringify(outName)}] = __ksDefault(${modVar});`;
          }
          return `exports[${JSON.stringify(outName)}] = ${modVar}[${JSON.stringify(orig)}];`;
        })
        .join(" ");
      return `const ${modVar} = require(${modSpec}); ${assigns}`;
    },
  );

  // `import def, { a, b as c } from "mod";` / `import def from "mod";` / `import * as ns from "mod";` / `import { ... } from "mod";` / `import "mod";`
  code = code.replace(
    /^\s*import\s+(['"][^'"]+['"])\s*;?/gm,
    (_m, spec) => `require(${spec});`,
  );
  code = code.replace(
    /^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(['"][^'"]+['"])\s*;?/gm,
    (_m, name, spec) => `const ${name} = require(${spec});`,
  );
  code = code.replace(
    /^\s*import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]+)\}\s*from\s+(['"][^'"]+['"])\s*;?/gm,
    (_m, defName, named: string, spec) => {
      const mapped = named.replace(/\b([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\b/g, "$1: $2");
      return `const __imp_${defName} = require(${spec}); const ${defName} = __ksDefault(__imp_${defName}); const {${mapped}} = __imp_${defName};`;
    },
  );
  code = code.replace(
    /^\s*import\s+\{([^}]+)\}\s*from\s+(['"][^'"]+['"])\s*;?/gm,
    (_m, named: string, spec) => {
      const mapped = named.replace(/\b([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\b/g, "$1: $2");
      return `const {${mapped}} = require(${spec});`;
    },
  );
  code = code.replace(
    /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"][^'"]+['"])\s*;?/gm,
    (_m, name, spec) => `const ${name} = __ksDefault(require(${spec}));`,
  );

  // `export async function name` / `export function name` / `export class name`
  code = code.replace(
    /^\s*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    (_m, asyncKw = "", name) => `exports.${name} = ${name}; ${asyncKw}function ${name}`,
  );
  code = code.replace(
    /^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gm,
    (_m, name) => `class ${name}`,
  );
  // Capture exported class names separately if needed via trailing assignment? Even easier:
  code = code.replace(
    /^class\s+([A-Za-z_$][\w$]*)\s*(\{|extends\b)/gm,
    (m) => m,
  );

  // `export const/let/var name = ...`
  const exportedDecls: string[] = [];
  code = code.replace(
    /^\s*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)\b/gm,
    (_m, kind, name) => {
      exportedDecls.push(name);
      return `${kind} ${name}`;
    },
  );

  // `export default ...`
  code = code.replace(/^\s*export\s+default\s+/gm, "exports.default = ");

  // `export { a, b as c };`
  code = code.replace(/^\s*export\s*\{([^}]+)\}\s*;?/gm, (_m, specifiers: string) =>
    specifiers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => {
        const [orig, alias] = part.split(/\s+as\s+/).map((x) => x.trim());
        return `exports[${JSON.stringify(alias || orig!)}] = ${orig};`;
      })
      .join(" "),
  );

  if (exportedDecls.length > 0) {
    code +=
      "\n" + exportedDecls.map((name) => `exports[${JSON.stringify(name)}] = ${name};`).join("\n");
  }

  return code;
}

function esmToCjs(source: string): string {
  if (optionalSyncTranspiler) {
    return rewriteDynamicImports(optionalSyncTranspiler(source));
  }
  return pureJsEsmToCjs(source);
}

const BOUND_GLOBAL_FNS = new Set([
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "structuredClone",
  "atob",
  "btoa",
  "fetch",
]);

/** Browser/universal isolated-scope CJS runner (zero Node dependencies). */
export function createScopedFunctionRunner(globals: {
  fetch: typeof fetch;
}): ScriptRunner {
  const localStore: Record<string | symbol, unknown> = Object.create(null);
  localStore.fetch = globals.fetch;
  localStore.performance = globalThis.performance;
  localStore.crypto = globalThis.crypto;
  installBase64Polyfill(Uint8Array);

  const scope: Record<string | symbol, unknown> = new Proxy(localStore, {
    has(target, prop) {
      return Reflect.has(target, prop) || Reflect.has(globalThis, prop);
    },
    get(target, prop) {
      if (Reflect.has(target, prop)) {
        return target[prop];
      }
      const val = Reflect.get(globalThis, prop, globalThis);
      if (typeof val === "function" && typeof prop === "string" && BOUND_GLOBAL_FNS.has(prop)) {
        return val.bind(globalThis);
      }
      return val;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    defineProperty(target, prop, descriptor) {
      return Reflect.defineProperty(target, prop, descriptor);
    },
    deleteProperty(target, prop) {
      return Reflect.deleteProperty(target, prop);
    },
  });
  localStore.globalThis = scope;
  localStore.self = scope;
  localStore.window = scope;
  localStore[Symbol.unscopables] = { eval: true };
  localStore.eval = new Function(
    "scope",
    "return function scopedEval(source) { with (scope) { return eval(source); } };",
  )(scope);

  return {
    runModule(code, filename, cjsRequire, dynamicImport, moduleObj) {
      scope.__ksImport = dynamicImport;
      scope.__ksDefault = (mod: unknown) => {
        if (
          mod instanceof WebAssembly.Module ||
          (mod && typeof mod === "object" && !("__esModule" in mod) && !("default" in mod))
        ) {
          return mod;
        }
        const rec = mod as Record<string, unknown>;
        return rec.default !== undefined ? rec.default : mod;
      };
      const wrapped = `(function(globalThis, self, window, fetch, require, exports, module, __filename, __ksImport, __ksDefault) {\n${code}\n})`;
      const fn = new Function("return " + wrapped)() as (
        g: unknown,
        s: unknown,
        w: unknown,
        f: unknown,
        r: unknown,
        e: unknown,
        m: unknown,
        fnArg: string,
        dyn: unknown,
        defFn: unknown,
      ) => void;
      fn(
        scope,
        scope,
        scope,
        globals.fetch,
        cjsRequire,
        moduleObj.exports,
        moduleObj,
        filename,
        dynamicImport,
        scope.__ksDefault,
      );
    },
  };
}

export interface InProcessLoaderOptions {
  /** Pre-compiled CJS bundles (`KITESURF_CJS_BUNDLES`). */
  cjsBundles: Record<string, string>;
  /** Custom ScriptRunner factory (Node provides `node:vm` isolation; browser defaults to ScopedFunctionRunner). */
  runnerFactory?: ScriptRunnerFactory;
}

interface RawWorkerSpec {
  mainModule?: string;
  modules?: Record<
    string,
    string | WebAssembly.Module | { wasm?: ArrayBuffer | Uint8Array; cjs?: string; js?: string; json?: unknown }
  >;
  env?: Record<string, unknown>;
  globalOutbound?: { fetch(req: Request): Promise<Response> } | null;
}

function normalizeModuleName(specifier: string, referrer: string): string {
  if (specifier === "cloudflare:workers") return specifier;
  if (specifier.startsWith("http://") || specifier.startsWith("https://")) return specifier;
  if (specifier.startsWith("./")) return specifier.slice(2);
  if (specifier.startsWith("/")) return specifier.slice(1);
  if (specifier.startsWith("../")) {
    const parts = referrer.split("/").slice(0, -1);
    for (const seg of specifier.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  }
  return specifier;
}

export function createInProcessWorkerLoader(options: InProcessLoaderOptions): WorkerLoader {
  const bundles = options.cjsBundles;
  const runnerFactory = options.runnerFactory ?? ((g) => createScopedFunctionRunner(g));

  return {
    load(rawSpec: Record<string, unknown>) {
      const spec = rawSpec as unknown as RawWorkerSpec;
      const mainModule = spec.mainModule ?? "page.js";
      const specModules = spec.modules ?? {};
      const workerEnv = spec.env ?? {};
      const globalFetch: typeof fetch = spec.globalOutbound
        ? (input: RequestInfo | URL, init?: RequestInit) => {
            const req = input instanceof Request ? input : new Request(input, init);
            return spec.globalOutbound!.fetch(req);
          }
        : (...args) => fetch(...args);

      const runner = runnerFactory({ fetch: globalFetch });
      const moduleCache = new Map<string, unknown>();

      function resolveBuiltinOrModule(specifier: string, referrer: string): unknown {
        if (specifier === "cloudflare:workers") {
          return { WorkerEntrypoint, RpcTarget, abortIsolate };
        }
        const key = normalizeModuleName(specifier, referrer);
        if (moduleCache.has(key)) return moduleCache.get(key);

        // Pre-compiled CJS bundle fast-paths
        if (key === "wasm-glue.js") {
          const glueKey =
            mainModule === "renderer.js" ? "renderer_core.glue.js" : "kitesurf_core.glue.js";
          const code = bundles[glueKey];
          if (code) return executeCjs(key, code);
        }
        if (
          key === "page.js" ||
          key === "dom-shim.js" ||
          key === "internal-state.js" ||
          key === "renderer.js" ||
          key === "worker.js"
        ) {
          const precompiled = bundles[key];
          if (precompiled) return executeCjs(key, precompiled);
        }

        // Core & renderer WASM fast-path (avoid re-compiling 30MB / 5MB buffers)
        if (key === "core_bg.wasm") {
          const compiled =
            mainModule === "renderer.js" ? getRendererWasmModule() : getCoreWasmModule();
          moduleCache.set(key, compiled);
          return compiled;
        }

        const entry = specModules[key] ?? specModules[specifier];
        if (entry === undefined) {
          throw new Error(`Module not found in isolate "${mainModule}": ${specifier}`);
        }

        if (entry instanceof WebAssembly.Module) {
          moduleCache.set(key, entry);
          return entry;
        }

        if (typeof entry === "string") {
          return executeCjs(key, esmToCjs(entry));
        }

        if (typeof entry === "object" && entry !== null) {
          const rec = entry as {
            wasm?: ArrayBuffer | Uint8Array;
            cjs?: string;
            js?: string;
            json?: unknown;
          };
          if (rec.wasm !== undefined) {
            const raw = rec.wasm;
            const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            const compiled = new WebAssembly.Module(copy.buffer);
            moduleCache.set(key, compiled);
            return compiled;
          }
          if (rec.json !== undefined) {
            const ns = { default: rec.json };
            moduleCache.set(key, ns);
            return ns;
          }
          if (rec.cjs !== undefined) {
            return executeCjs(key, rewriteDynamicImports(rec.cjs));
          }
          if (rec.js !== undefined) {
            return executeCjs(key, esmToCjs(rec.js));
          }
        }

        throw new Error(`Unsupported module entry type for "${key}"`);
      }

      function executeCjs(filename: string, cjsCode: string): Record<string, unknown> {
        const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
        moduleCache.set(filename, moduleObj.exports);
        const localRequire = (subSpec: string) => resolveBuiltinOrModule(subSpec, filename);
        const dynamicImport = async (subSpec: string) => resolveBuiltinOrModule(subSpec, filename);
        try {
          runner.runModule(cjsCode, filename, localRequire, dynamicImport, moduleObj);
        } catch (err) {
          moduleCache.delete(filename);
          throw err;
        }
        moduleCache.set(filename, moduleObj.exports);
        return moduleObj.exports;
      }

      return {
        getEntrypoint<T = unknown>(
          name = "default",
          epOpts?: { props?: Record<string, unknown> },
        ): T {
          const entryExports = resolveBuiltinOrModule(mainModule, "") as Record<string, unknown>;
          const Ctor = (entryExports[name] ?? entryExports.default) as
            | (new (ctx: unknown, env: unknown) => Record<string, unknown>)
            | undefined;
          if (typeof Ctor !== "function") {
            throw new Error(
              `Entrypoint "${name}" not found in isolate "${mainModule}" (exports: ${Object.keys(entryExports).join(", ")})`,
            );
          }
          const ctx = {
            props: epOpts?.props ?? {},
            waitUntil(p: Promise<unknown>) {
              void p.catch(() => {});
            },
            passThroughOnException() {},
          };
          const instance = new Ctor(ctx, workerEnv);
          return wrapEntrypointObject(instance) as unknown as T;
        },
      };
    },
  };
}
