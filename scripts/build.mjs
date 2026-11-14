#!/usr/bin/env node
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

const commonOptions = {
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: false,
  logLevel: "warning",
};

async function rewriteDtsExtensions(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await rewriteDtsExtensions(full);
    } else if (entry.name.endsWith(".d.ts")) {
      const content = await readFile(full, "utf8");
      const rewritten = content
        .replace(/(\bfrom\s+["'])(\.\.?\/[^"']+)\.ts(["'])/g, "$1$2.js$3")
        .replace(/(\bimport\s+["'])(\.\.?\/[^"']+)\.ts(["'])/g, "$1$2.js$3");
      if (rewritten !== content) {
        await writeFile(full, rewritten);
      }
    }
  }
}

async function run() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(resolve(DIST, "bin"), { recursive: true });

  // Node library bundle
  await build({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/index.ts")],
    outfile: resolve(DIST, "index.js"),
    platform: "node",
    packages: "external",
  });

  // Node CLI binary
  await build({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/cli.ts")],
    outfile: resolve(DIST, "bin/just-browser.js"),
    platform: "node",
    packages: "external",
    banner: { js: "#!/usr/bin/env node" },
  });
  await chmod(resolve(DIST, "bin/just-browser.js"), 0o755);

  // Pure-browser / WASM-host bundle (must contain zero `node:*` imports)
  await build({
    ...commonOptions,
    entryPoints: [resolve(ROOT, "src/browser.ts")],
    outfile: resolve(DIST, "browser.js"),
    platform: "browser",
    mainFields: ["browser", "module", "main"],
    external: ["node:zlib"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  const browserBundle = await readFile(resolve(DIST, "browser.js"), "utf8");
  const nodeBuiltinImports = [
    ...browserBundle.matchAll(
      /\b(?:from|require)\s*\(?["']node:(?!zlib\b)[a-zA-Z0-9_/-]+["']/g,
    ),
  ];
  if (nodeBuiltinImports.length > 0) {
    throw new Error(
      `Browser bundle leaked unexpected node:* imports: ${nodeBuiltinImports.map((m) => m[0]).join(", ")}`,
    );
  }

  // Emit TypeScript declaration files into dist/
  const tscBin = resolve(ROOT, "node_modules/typescript/bin/tsc");
  execFileSync(process.execPath, [tscBin, "-p", resolve(ROOT, "tsconfig.build.json")], {
    cwd: ROOT,
    stdio: "inherit",
  });
  await rewriteDtsExtensions(DIST);

  console.log(
    "[build] Built dist/index.js, dist/browser.js, dist/bin/just-browser.js, and dist/*.d.ts cleanly",
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
