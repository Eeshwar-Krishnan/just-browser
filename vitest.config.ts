import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const ROOT = import.meta.dirname;
const SHIMS = resolve(ROOT, "src/kitesurf/shims");
const KITESURF = resolve(ROOT, "vendor/kitesurf/packages");

function kitesurfVitePlugin() {
  return {
    name: "kitesurf-in-process-shims",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (source === "cloudflare:workers") {
        return resolve(SHIMS, "cloudflare-workers.ts");
      }
      if (source === "kitesurf-core") {
        return resolve(ROOT, "assets/wasm/kitesurf_core.glue.js");
      }
      if (source === "@kitesurf/dom-shim") {
        return resolve(KITESURF, "dom-shim/dist/index.js");
      }
      if (source.startsWith("@kitesurf/dom-shim/")) {
        const sub = source.slice("@kitesurf/dom-shim/".length);
        return resolve(KITESURF, `dom-shim/src/${sub}.ts`);
      }
      if (source === "@kitesurf/page-script") {
        return resolve(KITESURF, "page-script/dist/index.js");
      }
      if (source === "@kitesurf/page-renderer") {
        return resolve(KITESURF, "page-renderer/dist/index.js");
      }
      if (source === "@kitesurf/worker-script") {
        return resolve(KITESURF, "worker-script/dist/index.js");
      }
      if (source === "@kitesurf/script-gate") {
        return resolve(KITESURF, "script-gate/src/index.ts");
      }
      if (source.startsWith("@kitesurf/script-gate/")) {
        const sub = source.slice("@kitesurf/script-gate/".length);
        return resolve(KITESURF, `script-gate/src/${sub}.ts`);
      }
      if (source.startsWith("@kitesurf/jsrpc-types/")) {
        const sub = source.slice("@kitesurf/jsrpc-types/".length);
        return resolve(KITESURF, `jsrpc-types/src/${sub}.ts`);
      }
      if (importer && importer.includes("vendor/kitesurf")) {
        if (source === "node:fs") {
          return resolve(SHIMS, "vfs-fs-shim.ts");
        }
        if (source === "node:async_hooks") {
          return resolve(SHIMS, "async-hooks.ts");
        }
        if (source.endsWith("kitesurf_core_bg.wasm")) {
          return resolve(SHIMS, "wasm-module-core.ts");
        }
        if (source.endsWith("renderer_core_bg.wasm")) {
          return resolve(SHIMS, "wasm-module-renderer.ts");
        }
        if (source.endsWith("kitesurf_core.glue.js") || source.endsWith("renderer_core.glue.js")) {
          return "\0virtual:kitesurf-glue-marker";
        }
      }
      return null;
    },
    load(id: string) {
      if (id === "\0virtual:kitesurf-glue-marker") {
        return 'export default "__KS_GLUE__";';
      }
      if (id.includes("vendor/kitesurf") && (id.endsWith(".dat") || id.endsWith(".css"))) {
        return `export default ${JSON.stringify(readFileSync(id, "utf8"))};`;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [kitesurfVitePlugin()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
  },
});
