/**
 * Pure-browser / WASM-host entrypoint for `just-browser`.
 * Zero `node:*` imports — runs completely inside web browsers, Web Workers, or edge isolates.
 */

import "./kitesurf/shims/base64-polyfill.ts";
import { Bash, type BashOptions, type BashExecResult, type Command } from "just-bash/browser";
import { createFontAssetsFetcher, type FontAssetsFetcher, type FontLoaderFn } from "./kitesurf/font-assets.ts";
import {
  ensureLoaderLexerReady,
  createInProcessWorkerLoader,
  type ScriptRunnerFactory,
} from "./kitesurf/in-process-loader.ts";
import { createInProcessCdpSession, type InProcessCdpSession } from "./kitesurf/session-host.ts";
import { isWasmRegistered, registerWasmBytes } from "./kitesurf/shims/wasm-registry.ts";
import {
  JustBrowserManager,
  createAgentBrowserCommand,
  createPluginFromManagerOptions,
  VIRTUAL_FS_ORIGIN,
  type AgentBrowserPlugin,
  type BashCommandTarget,
} from "./agent-browser/command.ts";
import { CdpClient } from "./agent-browser/cdp-client.ts";
import { RefMap } from "./agent-browser/ref-map.ts";
import { takeSnapshot } from "./agent-browser/snapshot.ts";

export {
  Bash,
  CdpClient,
  JustBrowserManager,
  RefMap,
  VIRTUAL_FS_ORIGIN,
  createAgentBrowserCommand,
  createFontAssetsFetcher,
  createInProcessCdpSession,
  createInProcessWorkerLoader,
  ensureLoaderLexerReady,
  isWasmRegistered,
  registerWasmBytes,
  takeSnapshot,
};

export type {
  AgentBrowserPlugin,
  BashCommandTarget,
  FontAssetsFetcher,
  FontLoaderFn,
  InProcessCdpSession,
  ScriptRunnerFactory,
};

export interface BrowserWasmAssetSource {
  /** Preloaded bytes or fetch URL for `kitesurf_core_bg.wasm`. */
  coreWasm: Uint8Array | ArrayBuffer | string;
  /** Preloaded bytes or fetch URL for `renderer_core_bg.wasm`. */
  rendererWasm: Uint8Array | ArrayBuffer | string;
  /** Optional base URL ending in `/` (e.g. `"/assets/fonts/"`) or explicit font loader for `/fonts/*`. */
  fonts?: string | FontLoaderFn | Map<string, Uint8Array>;
}

export interface CreateBrowserAgentBrowserPluginOptions {
  /** WASM & font asset sources for Kitesurf inside the browser runtime. */
  assets: BrowserWasmAssetSource;
  /** Custom script runner factory (defaults to isolated scope wrapper). */
  runnerFactory?: ScriptRunnerFactory;
  /** Optional custom HTTP fetch handler. */
  externalFetch?: (request: Request) => Promise<Response>;
  /** Allow fallback to browser `fetch()` when `bash.network` is not configured. Default: `false`. */
  allowDirectNetwork?: boolean;
  /** Default browser session name (default: `"default"`). */
  defaultSessionName?: string;
}

export interface CreateBrowserJustBrowserOptions extends CreateBrowserAgentBrowserPluginOptions {
  /** Options forwarded to `just-bash/browser`. */
  bash?: BashOptions;
  /** Extra custom commands alongside `agent-browser`. */
  customCommands?: Command[];
}

async function resolveWasmBytes(src: Uint8Array | ArrayBuffer | string): Promise<Uint8Array | ArrayBuffer> {
  if (typeof src !== "string") return src;
  const resp = await fetch(src);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Kitesurf WASM asset ${src}: HTTP ${resp.status}`);
  }
  return resp.arrayBuffer();
}

function buildBrowserFontFetcher(fonts?: BrowserWasmAssetSource["fonts"]): FontAssetsFetcher {
  if (typeof fonts === "function") {
    return createFontAssetsFetcher(fonts);
  }
  if (fonts instanceof Map) {
    return createFontAssetsFetcher(async (name) => fonts.get(name) ?? null);
  }
  const baseUrl = typeof fonts === "string" ? (fonts.endsWith("/") ? fonts : `${fonts}/`) : "/fonts/";
  return createFontAssetsFetcher(async (filename) => {
    try {
      const resp = await fetch(`${baseUrl}${filename}`);
      if (!resp.ok) return null;
      return new Uint8Array(await resp.arrayBuffer());
    } catch {
      return null;
    }
  });
}

export interface JustBrowserInstance {
  bash: Bash;
  manager: JustBrowserManager;
  exec(command: string): Promise<BashExecResult>;
  close(): Promise<void>;
}

/**
 * Create a standalone pure-browser `agent-browser` command + session manager plugin
 * for `new Bash({ customCommands: [plugin.command, ...] })` or `bash.registerCommand(...)`.
 */
export function createAgentBrowserPlugin(
  options: CreateBrowserAgentBrowserPluginOptions,
): AgentBrowserPlugin {
  let initPromise: Promise<{ fontAssets: FontAssetsFetcher }> | null = null;

  const ensureAssets = () => {
    if (!initPromise) {
      initPromise = (async () => {
        await ensureLoaderLexerReady();
        if (!isWasmRegistered()) {
          const [coreWasm, rendererWasm] = await Promise.all([
            resolveWasmBytes(options.assets.coreWasm),
            resolveWasmBytes(options.assets.rendererWasm),
          ]);
          await registerWasmBytes({ coreWasm, rendererWasm });
        }
        return { fontAssets: buildBrowserFontFetcher(options.assets.fonts) };
      })();
    }
    return initPromise;
  };

  return createPluginFromManagerOptions({
    ensureAssets,
    runnerFactory: options.runnerFactory,
    externalFetch: options.externalFetch,
    allowDirectNetwork: options.allowDirectNetwork ?? false,
    defaultSessionName: options.defaultSessionName ?? "default",
  });
}

/**
 * Inject `agent-browser` (backed by Kitesurf WASM) into an existing `just-bash` `Bash`
 * instance alongside any other custom tools or commands already registered on it.
 */
export function attachAgentBrowser(
  bash: BashCommandTarget,
  options: CreateBrowserAgentBrowserPluginOptions,
): AgentBrowserPlugin {
  const plugin = createAgentBrowserPlugin(options);
  bash.registerCommand(plugin.command);
  return plugin;
}

export function createJustBrowser(options: CreateBrowserJustBrowserOptions): JustBrowserInstance {
  const plugin = createAgentBrowserPlugin(options);
  const existingCustom = options.bash?.customCommands ?? [];
  const extraCustom = options.customCommands ?? [];

  const bash = new Bash({
    ...options.bash,
    customCommands: [...existingCustom, ...extraCustom, plugin.command],
  });

  return {
    bash,
    manager: plugin.manager,
    exec: (command: string) => bash.exec(command),
    close: () => plugin.close(),
  };
}
