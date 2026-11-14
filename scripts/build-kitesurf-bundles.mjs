#!/usr/bin/env node
import { build, transform } from "esbuild";
import { build as viteBuild } from "vite";
import { init as initLexer, parse as parseModuleLexer } from "es-module-lexer";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KITESURF_PKGS = resolve(ROOT, "vendor/kitesurf/packages");
const WASM_ASSETS = resolve(ROOT, "assets/wasm");
const BUNDLES_OUT = resolve(ROOT, "assets/kitesurf-bundles");

// Prevent internal-state.ts from being bundled twice into page-script or dom-shim.
const sharedStateGuard = {
  name: "shared-state-guard",
  setup(b) {
    b.onResolve({ filter: /(^|\/)internal-state\.ts$/ }, (args) => ({
      errors: [
        {
          text: `${args.importer} imports ${args.path}: use "./internal-state.js"`,
        },
      ],
    }));
  },
};

// Resolve @kitesurf/* workspace imports inside vendor/kitesurf/packages/* directly to their TypeScript sources.
const kitesurfWorkspacePlugin = {
  name: "kitesurf-workspace-resolver",
  setup(b) {
    b.onResolve({ filter: /^@kitesurf\// }, (args) => {
      const rest = args.path.slice("@kitesurf/".length);
      const slash = rest.indexOf("/");
      const pkg = slash === -1 ? rest : rest.slice(0, slash);
      const sub = slash === -1 ? "index" : rest.slice(slash + 1);
      return {
        path: resolve(KITESURF_PKGS, pkg, "src", `${sub}.ts`),
      };
    });
  },
};

async function toCjs(esmCode) {
  await initLexer;
  const res = await transform(esmCode, {
    format: "cjs",
    target: "esnext",
    minify: true,
    keepNames: true,
    define: { "import.meta.url": '""' },
  });
  let code = res.code;
  const [imports] = parseModuleLexer(code);
  const dynSites = imports.filter((i) => i.d >= 0).sort((a, b) => b.ss - a.ss);
  for (const site of dynSites) {
    if (code.slice(site.ss, site.ss + 6) === "import") {
      code = code.slice(0, site.ss) + "globalThis.__ksImport" + code.slice(site.ss + 6);
    }
  }
  return code;
}

async function buildDomShim() {
  const pkgRoot = resolve(KITESURF_PKGS, "dom-shim");
  const distDir = resolve(pkgRoot, "dist");
  const bundleOut = resolve(distDir, "dom-shim.js");
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const internalStateRe = /(^|\/)internal-state\.js$/;
  await viteBuild({
    root: pkgRoot,
    configFile: false,
    logLevel: "warn",
    build: {
      lib: {
        entry: resolve(pkgRoot, "src/index.ts"),
        formats: ["es"],
        fileName: () => "dom-shim.js",
      },
      outDir: distDir,
      emptyOutDir: false,
      target: "esnext",
      minify: "esbuild",
      sourcemap: false,
      cssMinify: false,
      cssCodeSplit: false,
      reportCompressedSize: false,
      rollupOptions: {
        external: (id) => internalStateRe.test(id),
        output: {
          paths: (id) => (internalStateRe.test(id) ? "./internal-state.js" : id),
        },
        treeshake: true,
      },
    },
    esbuild: {
      keepNames: true,
      legalComments: "none",
      minifyWhitespace: true,
      minifyIdentifiers: true,
      minifySyntax: true,
    },
  });

  const esm = await readFile(bundleOut, "utf8");
  const minEsm = (
    await transform(esm, {
      minify: true,
      keepNames: true,
      target: "esnext",
      format: "esm",
      legalComments: "none",
    })
  ).code;
  await writeFile(bundleOut, minEsm);

  const cjs = await toCjs(minEsm);
  await writeFile(resolve(distDir, "dom-shim.cjs"), cjs);

  await writeFile(
    resolve(distDir, "index.js"),
    `export const DOM_SHIM_SOURCE = ${JSON.stringify(minEsm)};\n` +
      `export const DOM_SHIM_CJS = ${JSON.stringify(cjs)};\n`,
  );
  await writeFile(
    resolve(distDir, "index.d.ts"),
    `export declare const DOM_SHIM_SOURCE: string;\nexport declare const DOM_SHIM_CJS: string;\n`,
  );
  console.log(`[build-kitesurf] dom-shim: ${(minEsm.length / 1024).toFixed(1)} KiB ESM`);
  return { esm: minEsm, cjs };
}

async function buildPageScript() {
  const pkgRoot = resolve(KITESURF_PKGS, "page-script");
  const distDir = resolve(pkgRoot, "dist");
  const bundleOut = resolve(distDir, "page-script.js");
  const internalOut = resolve(distDir, "internal-state.js");
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await build({
    entryPoints: [resolve(pkgRoot, "src/index.ts")],
    outfile: bundleOut,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "esnext",
    external: [
      "cloudflare:*",
      "node:*",
      "./wasm-glue.js",
      "./core_bg.wasm",
      "./dom-shim.js",
      "./internal-state.js",
      "./__ks_startup_probe_input.js",
      "./__ks_import_map.js",
      "./__ks_user_classic_regular.js",
      "./__ks_user_classic_async.js",
      "./__ks_wasm_registry.js",
    ],
    minify: true,
    keepNames: true,
    sourcemap: false,
    logLevel: "warning",
    conditions: ["workerd", "worker", "browser"],
    resolveExtensions: [".ts", ".mjs", ".js", ".json"],
    plugins: [sharedStateGuard, kitesurfWorkspacePlugin],
  });

  await build({
    entryPoints: [resolve(pkgRoot, "src/internal-state.ts")],
    outfile: internalOut,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "esnext",
    minify: true,
    keepNames: true,
    sourcemap: false,
    logLevel: "warning",
    conditions: ["workerd", "worker", "browser"],
    resolveExtensions: [".ts", ".mjs", ".js", ".json"],
    plugins: [kitesurfWorkspacePlugin],
  });

  const esm = await readFile(bundleOut, "utf8");
  const cjs = await toCjs(esm);
  const internalEsm = await readFile(internalOut, "utf8");
  const internalCjs = await toCjs(internalEsm);

  await writeFile(resolve(distDir, "page-script.cjs"), cjs);
  await writeFile(resolve(distDir, "internal-state.cjs"), internalCjs);
  await writeFile(
    resolve(distDir, "index.js"),
    `export const PAGE_SCRIPT_SOURCE = ${JSON.stringify(esm)};\n` +
      `export const INTERNAL_STATE_SOURCE = ${JSON.stringify(internalEsm)};\n`,
  );
  await writeFile(
    resolve(distDir, "index.d.ts"),
    `export declare const PAGE_SCRIPT_SOURCE: string;\nexport declare const INTERNAL_STATE_SOURCE: string;\n`,
  );
  console.log(`[build-kitesurf] page-script: ${(esm.length / 1024).toFixed(1)} KiB ESM`);
  return { esm, cjs, internalEsm, internalCjs };
}

async function buildPageRenderer() {
  const pkgRoot = resolve(KITESURF_PKGS, "page-renderer");
  const distDir = resolve(pkgRoot, "dist");
  const bundleOut = resolve(distDir, "page-renderer.js");
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await build({
    entryPoints: [resolve(pkgRoot, "src/index.ts")],
    outfile: bundleOut,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "esnext",
    external: ["cloudflare:*", "node:*", "./wasm-glue.js", "./core_bg.wasm"],
    minify: true,
    keepNames: true,
    sourcemap: false,
    logLevel: "warning",
    conditions: ["workerd", "worker", "browser"],
    resolveExtensions: [".ts", ".mjs", ".js", ".json"],
    plugins: [kitesurfWorkspacePlugin],
  });

  const esm = await readFile(bundleOut, "utf8");
  const cjs = await toCjs(esm);
  await writeFile(resolve(distDir, "page-renderer.cjs"), cjs);
  await writeFile(
    resolve(distDir, "index.js"),
    `export const PAGE_RENDERER_SOURCE = ${JSON.stringify(esm)};\n`,
  );
  await writeFile(
    resolve(distDir, "index.d.ts"),
    `export declare const PAGE_RENDERER_SOURCE: string;\n`,
  );
  console.log(`[build-kitesurf] page-renderer: ${(esm.length / 1024).toFixed(1)} KiB ESM`);
  return { esm, cjs };
}

async function buildWorkerScript() {
  const pkgRoot = resolve(KITESURF_PKGS, "worker-script");
  const distDir = resolve(pkgRoot, "dist");
  const bundleOut = resolve(distDir, "worker-script.js");
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await build({
    entryPoints: [resolve(pkgRoot, "src/index.ts")],
    outfile: bundleOut,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "esnext",
    external: ["cloudflare:*", "node:*", "./__ks_worker_script.js"],
    minify: true,
    keepNames: true,
    sourcemap: false,
    logLevel: "warning",
    conditions: ["workerd", "worker", "browser"],
    resolveExtensions: [".ts", ".mjs", ".js", ".json"],
    plugins: [kitesurfWorkspacePlugin],
  });

  const esm = await readFile(bundleOut, "utf8");
  const cjs = await toCjs(esm);
  await writeFile(resolve(distDir, "worker-script.cjs"), cjs);
  await writeFile(
    resolve(distDir, "index.js"),
    `export const WORKER_SCRIPT_SOURCE = ${JSON.stringify(esm)};\n`,
  );
  await writeFile(
    resolve(distDir, "index.d.ts"),
    `export declare const WORKER_SCRIPT_SOURCE: string;\n`,
  );
  console.log(`[build-kitesurf] worker-script: ${(esm.length / 1024).toFixed(1)} KiB ESM`);
  return { esm, cjs };
}

const SHIMS = resolve(ROOT, "src/kitesurf/shims");

const engineHostPlugin = {
  name: "engine-host-resolver",
  setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
      path: resolve(SHIMS, "cloudflare-workers.ts"),
    }));
    b.onResolve({ filter: /^kitesurf-core$/ }, () => ({
      path: resolve(WASM_ASSETS, "kitesurf_core.glue.js"),
    }));
    b.onResolve({ filter: /^@kitesurf\/dom-shim$/ }, () => ({
      path: resolve(KITESURF_PKGS, "dom-shim/dist/index.js"),
    }));
    b.onResolve({ filter: /^@kitesurf\/dom-shim\// }, (args) => ({
      path: resolve(KITESURF_PKGS, "dom-shim/src", `${args.path.slice("@kitesurf/dom-shim/".length)}.ts`),
    }));
    b.onResolve({ filter: /^@kitesurf\/page-script$/ }, () => ({
      path: resolve(KITESURF_PKGS, "page-script/dist/index.js"),
    }));
    b.onResolve({ filter: /^@kitesurf\/page-renderer$/ }, () => ({
      path: resolve(KITESURF_PKGS, "page-renderer/dist/index.js"),
    }));
    b.onResolve({ filter: /^@kitesurf\/worker-script$/ }, () => ({
      path: resolve(KITESURF_PKGS, "worker-script/dist/index.js"),
    }));
    b.onResolve({ filter: /^@kitesurf\/script-gate$/ }, () => ({
      path: resolve(KITESURF_PKGS, "script-gate/src/index.ts"),
    }));
    b.onResolve({ filter: /^@kitesurf\/script-gate\// }, (args) => ({
      path: resolve(
        KITESURF_PKGS,
        "script-gate/src",
        `${args.path.slice("@kitesurf/script-gate/".length)}.ts`,
      ),
    }));
    b.onResolve({ filter: /^@kitesurf\/jsrpc-types\// }, (args) => ({
      path: resolve(
        KITESURF_PKGS,
        "jsrpc-types/src",
        `${args.path.slice("@kitesurf/jsrpc-types/".length)}.ts`,
      ),
    }));
    b.onResolve({ filter: /kitesurf_core_bg\.wasm$/ }, () => ({
      path: resolve(SHIMS, "wasm-module-core.ts"),
    }));
    b.onResolve({ filter: /renderer_core_bg\.wasm$/ }, () => ({
      path: resolve(SHIMS, "wasm-module-renderer.ts"),
    }));
    b.onResolve({ filter: /(kitesurf_core|renderer_core)\.glue\.js$/ }, (args) => {
      if (args.importer && args.importer.includes("vendor/kitesurf")) {
        return { path: args.path, namespace: "kitesurf-glue-marker" };
      }
      return undefined;
    });
    b.onLoad({ filter: /.*/, namespace: "kitesurf-glue-marker" }, () => ({
      contents: 'export default "__KS_GLUE__";',
      loader: "js",
    }));
  },
};

const ENGINE_HOST_DTS = `export interface CdpRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface CdpResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  sessionId?: string;
}

export interface CdpEvent {
  method: string;
  params?: unknown;
  sessionId?: string;
}

export type ExternalOutbound =
  | { fetch(request: Request): Promise<Response> }
  | ((request: Request) => Promise<Response>);

export type SandboxOutboundExports = Record<string, unknown>;

export interface PageTargetState {
  targetId: string;
  type: string;
  pendingNavAbort?: AbortController | null;
  navigateGeneration: number;
  pageScriptLease?: unknown;
}

export interface BrowserState {
  targets: Map<string, PageTargetState>;
  sandboxOutbound: unknown;
  contexts: Map<string, unknown>;
  nextBrowserContextId: number;
  autoAttach: boolean;
  flatten: boolean;
  cookies: unknown;
  screencasts: Map<string, { stopped: boolean }>;
  styleCache: unknown;
  imageCache: Map<string, unknown>;
  networkEvents: unknown;
  layoutMode: "full" | "off";
  cdpDebug: boolean;
  isolateCapOverrides: Record<string, unknown>;
  connectionMode: "browser" | "page";
  ttyKeyboard: boolean;
  preNavScripts: Map<string, string>;
  learnedInsertedScripts: Map<string, unknown>;
  pendingBindings: Set<string>;
  execContextSeq: number;
  runtimeEnabledSessions: Set<string>;
  rendererManager: { close(reason?: string): void } | null;
  workerBudget: { countPageTargets: () => number };
  dedicatedWorkers: { terminateAll(reason?: string): void };
  skipSpeculativeRaster: boolean;
  skipPartialRaster: boolean;
  fontDefer: boolean;
  rendererSessionId: string | null;
  engineSessionId: string | null;
  wsClosing: boolean;
  attributionHeaders: Record<string, string>;
}

export interface DispatchCtx {
  browser: BrowserState;
  emit: (event: CdpEvent) => void;
  commandExtension: unknown;
  requestBlocker: unknown;
  env: Record<string, unknown>;
  ctx: unknown;
  connectionId: string;
  analytics: unknown;
}

export declare function dispatch(ctx: DispatchCtx, req: CdpRequest): Promise<CdpResponse>;
export declare function ensureBrowserTarget(ctx: DispatchCtx): unknown;
export declare function createPageTarget(ctx: DispatchCtx, url: string): PageTargetState;
export declare function pumpBackgroundEvents(ctx: DispatchCtx, target: PageTargetState): void;
export declare function teardownOopifStubs(
  target: PageTargetState,
  reason: string,
  extra: unknown,
  opts: { budget: unknown; waitUntil: (p: Promise<unknown>) => void },
): void;
export declare function retireStub(
  target: PageTargetState,
  kind: string,
  reason: string,
  opts: { budget: unknown; waitUntil: (p: Promise<unknown>) => void },
): unknown;
export declare function releaseAllDomHandles(target: PageTargetState): void;
export declare function cancelAndRemoveTargetWheelQueues(browser: BrowserState, targetId: string): unknown;
export declare function stopSceneStreams(browser: BrowserState): void;
export declare class DynamicWorkerBudget {
  countPageTargets: () => number;
}
export declare class DedicatedWorkers {
  constructor(budget: DynamicWorkerBudget, waitUntil: (p: Promise<unknown>) => void);
  terminateAll(reason?: string): void;
}
export declare function createCookieJar(): unknown;
export declare class NetworkEventTracker {
  constructor(emit: (event: CdpEvent) => void, connectionId: string);
  drain(): void;
  dispose(): void;
}
export declare function registerTracker(connectionId: string, tracker: NetworkEventTracker): void;
export declare function unregisterTracker(connectionId: string): void;
export declare function registerCookieJar(connectionId: string, jar: unknown): void;
export declare function unregisterConnectionCookieJars(connectionId: string, contexts: Iterable<string>): void;
export declare function disposeWebMcpConnection(connectionId: string): void;
export declare function dropConnectionImages(connectionId: string): void;
export declare function unregisterIsolateLimitListenersFor(connectionId: string): void;
export declare class SandboxOutbound {
  constructor(ctx: unknown, env: unknown);
  fetch(req: Request): Promise<Response>;
}
export declare class DeniedOutbound {
  constructor(ctx: unknown, env: unknown);
  fetch(req: Request): Promise<Response>;
}
export declare class PageScriptTail {
  constructor(ctx: unknown, env: unknown);
}
export declare class SpanSink {
  constructor(ctx: unknown, env: unknown);
}
export declare function createSandboxOutboundOverride(
  exportsMap: SandboxOutboundExports,
  env: unknown,
  externalOutbound?: ExternalOutbound,
  filter?: unknown,
): unknown;
export declare function unregisterOutboundFilters(connectionId: string): void;
export declare function unregisterRequestBlocker(connectionId: string): void;
export declare function unregisterInterception(connectionId: string): void;
export declare function drainInterception(connectionId: string): void;
export declare class SafePerformance {
  constructor(perf?: Performance);
}
export declare class KitesurfAnalytics {
  constructor(meta: Record<string, unknown>, perf: SafePerformance, extra: Record<string, unknown>);
}
export declare function buildDispatchEnv(env: Record<string, unknown>): Record<string, unknown>;
export declare function markArrival(req: CdpRequest, now: number): void;
export declare class StyleCache {}
export declare function makeWallClock(env: Record<string, unknown>): () => number;
`;

async function buildEngineHost() {
  const outfile = resolve(BUNDLES_OUT, "engine-host.js");
  await build({
    entryPoints: [resolve(__dirname, "engine-host-entry.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    mainFields: ["module", "main"],
    packages: "external",
    sourcemap: false,
    logLevel: "warning",
    loader: {
      ".dat": "text",
      ".css": "text",
    },
    plugins: [engineHostPlugin],
  });
  const text = await readFile(outfile, "utf8");
  const nodeImports = [
    ...text.matchAll(/\b(?:from|require)\s*\(?["']node:[a-zA-Z0-9_/-]+["']/g),
  ];
  if (nodeImports.length > 0) {
    throw new Error(
      `engine-host.js leaked unexpected node:* imports: ${nodeImports.map((m) => m[0]).join(", ")}`,
    );
  }
  await writeFile(resolve(BUNDLES_OUT, "engine-host.d.ts"), ENGINE_HOST_DTS);
  console.log(`[build-kitesurf] engine-host: ${(text.length / 1024).toFixed(1)} KiB ESM`);
}

async function run() {
  await mkdir(BUNDLES_OUT, { recursive: true });
  const domShim = await buildDomShim();
  const pageScript = await buildPageScript();
  const pageRenderer = await buildPageRenderer();
  const workerScript = await buildWorkerScript();

  const coreGlueEsm = await readFile(resolve(WASM_ASSETS, "kitesurf_core.glue.js"), "utf8");
  const coreGlueCjs = await toCjs(coreGlueEsm);
  const rendererGlueEsm = await readFile(resolve(WASM_ASSETS, "renderer_core.glue.js"), "utf8");
  const rendererGlueCjs = await toCjs(rendererGlueEsm);

  // Emit pre-compiled CJS lookup module so the in-process WorkerLoader needs zero runtime bundler.
  const cjsMap = {
    "dom-shim.js": domShim.cjs,
    "page.js": pageScript.cjs,
    "internal-state.js": pageScript.internalCjs,
    "renderer.js": pageRenderer.cjs,
    "worker.js": workerScript.cjs,
    "kitesurf_core.glue.js": coreGlueCjs,
    "renderer_core.glue.js": rendererGlueCjs,
  };
  await writeFile(
    resolve(BUNDLES_OUT, "cjs-bundles.js"),
    `export const KITESURF_CJS_BUNDLES = ${JSON.stringify(cjsMap)};\n`,
  );
  await writeFile(
    resolve(BUNDLES_OUT, "cjs-bundles.d.ts"),
    `export declare const KITESURF_CJS_BUNDLES: Record<string, string>;\n`,
  );
  console.log("[build-kitesurf] emitted assets/kitesurf-bundles/cjs-bundles.js");
  await buildEngineHost();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
