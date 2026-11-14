/**
 * Node entrypoint combining `just-bash`, `agent-browser`, and Cloudflare Kitesurf
 * inside a single in-process JavaScript + WebAssembly runtime.
 */

import "./kitesurf/shims/base64-polyfill.ts";
import { Bash, type BashOptions, type BashExecResult, type Command } from "just-bash";
import { createFontAssetsFetcher, type FontAssetsFetcher, type FontLoaderFn } from "./kitesurf/font-assets.ts";
import {
  ensureLoaderLexerReady,
  createInProcessWorkerLoader,
  type ScriptRunnerFactory,
} from "./kitesurf/in-process-loader.ts";
import {
  createNodeVmRunnerFactory,
  ensureNodeKitesurfAssets,
} from "./kitesurf/node-assets.ts";
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
  createNodeVmRunnerFactory,
  ensureNodeKitesurfAssets,
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

export interface CreateAgentBrowserPluginOptions {
  /**
   * Optional custom outbound HTTP handler for non-VFS requests.
   */
  externalFetch?: (request: Request) => Promise<Response>;
  /**
   * Allow fallback to Node `globalThis.fetch` when `bash.network` (`ctx.fetch`) is not configured.
   * Defaults to `false` to preserve `just-bash`'s network sandbox.
   */
  allowDirectNetwork?: boolean;
  /** Default browser session name (default: `"default"`). */
  defaultSessionName?: string;
}

export interface CreateJustBrowserOptions extends CreateAgentBrowserPluginOptions {
  /** Options forwarded directly to `just-bash`'s `new Bash(...)`. */
  bash?: BashOptions;
  /** Extra custom commands alongside `agent-browser`. */
  customCommands?: Command[];
}

export interface JustBrowserInstance {
  /** Underlying `just-bash` virtual shell with `agent-browser` installed. */
  bash: Bash;
  /** Session and CDP lifecycle manager for `agent-browser` / Kitesurf. */
  manager: JustBrowserManager;
  /** Execute a shell command inside `just-bash`. */
  exec(command: string): Promise<BashExecResult>;
  /** Close all open Kitesurf WASM browser sessions and free resources. */
  close(): Promise<void>;
}

/**
 * Create a standalone `agent-browser` command + session manager plugin that can be
 * passed to `new Bash({ customCommands: [plugin.command, ...] })` or registered later
 * via `bash.registerCommand(plugin.command)`.
 */
export function createAgentBrowserPlugin(
  options: CreateAgentBrowserPluginOptions = {},
): AgentBrowserPlugin {
  return createPluginFromManagerOptions({
    ensureAssets: ensureNodeKitesurfAssets,
    runnerFactory: createNodeVmRunnerFactory(),
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
  options: CreateAgentBrowserPluginOptions = {},
): AgentBrowserPlugin {
  const plugin = createAgentBrowserPlugin(options);
  bash.registerCommand(plugin.command);
  return plugin;
}

/**
 * Create a `just-bash` environment with `agent-browser` wired to an in-process
 * Cloudflare Kitesurf WASM browser engine.
 */
export function createJustBrowser(options: CreateJustBrowserOptions = {}): JustBrowserInstance {
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
