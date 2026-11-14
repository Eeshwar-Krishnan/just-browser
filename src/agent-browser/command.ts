/**
 * Connects `agent-browser` into `just-bash` via `defineCommand`.
 * Manages persistent named Kitesurf browser sessions across shell invocations,
 * bridges virtual filesystem HTML/JS/CSS assets (`http://vfs.just-browser.local/...`)
 * and forwards external HTTP(S) traffic through `just-bash`'s `SecureFetch`.
 */

import { defineCommand, type Command, type IFileSystem, type SecureFetch } from "just-bash";
import type { ExternalOutbound } from "../../assets/kitesurf-bundles/engine-host.js";
import type { FontAssetsFetcher } from "../kitesurf/font-assets.ts";
import type { ScriptRunnerFactory } from "../kitesurf/in-process-loader.ts";
import { createInProcessCdpSession } from "../kitesurf/session-host.ts";
import { CdpClient } from "./cdp-client.ts";
import { RefMap } from "./ref-map.ts";
import { executeAgentBrowser, parseCliArgs, type BrowserSessionContext } from "./actions.ts";

export const VIRTUAL_FS_ORIGIN = "http://vfs.just-browser.local";

function mimeTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".wasm")) return "application/wasm";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export interface JustBrowserManagerOptions {
  /** Ensures WASM assets are registered and returns `FONT_ASSETS` Fetcher. */
  ensureAssets: () => Promise<{ fontAssets: FontAssetsFetcher }>;
  /** Optional custom script runner (Node injects `createNodeVmRunnerFactory()`, browser omits). */
  runnerFactory?: ScriptRunnerFactory;
  /** Optional custom HTTP fetch handler (useful in tests, edge proxies, or virtual mocks). */
  externalFetch?: (request: Request) => Promise<Response>;
  /** Allow fallback to global `fetch` when `just-bash` has no `network` (`ctx.fetch`) configured. */
  allowDirectNetwork?: boolean;
  /** Default browser session name. */
  defaultSessionName?: string;
}

export class JustBrowserManager {
  private readonly options: JustBrowserManagerOptions;
  private readonly sessions = new Map<string, BrowserSessionContext>();
  private activeFs: IFileSystem | null = null;
  private activeFetch: SecureFetch | undefined;

  constructor(options: JustBrowserManagerOptions) {
    this.options = options;
  }

  /** Update active `just-bash` filesystem & fetch bridge for the running command invocation. */
  bindCommandContext(fs: IFileSystem, secureFetch?: SecureFetch): void {
    this.activeFs = fs;
    this.activeFetch = secureFetch;
  }

  private createOutboundBridge(): ExternalOutbound {
    return {
      fetch: async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        if (url.origin === VIRTUAL_FS_ORIGIN) {
          if (!this.activeFs) {
            return new Response("Virtual filesystem unavailable", { status: 500 });
          }
          const vfsPath = decodeURIComponent(url.pathname);
          if (!(await this.activeFs.exists(vfsPath))) {
            return new Response(`Not found in VFS: ${vfsPath}`, { status: 404 });
          }
          const buf = await this.activeFs.readFileBuffer(vfsPath);
          const copy = new Uint8Array(buf.byteLength);
          copy.set(buf);
          return new Response(copy.buffer, {
            status: 200,
            headers: {
              "content-type": mimeTypeForPath(vfsPath),
              "access-control-allow-origin": "*",
            },
          });
        }

        if (this.options.externalFetch) {
          return this.options.externalFetch(request);
        }

        if (this.activeFetch) {
          const headers: Record<string, string> = {};
          request.headers.forEach((v, k) => {
            headers[k] = v;
          });
          let body: Uint8Array<ArrayBuffer> | undefined;
          if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
            const ab = await request.arrayBuffer();
            body = new Uint8Array(ab);
          }
          const res = await this.activeFetch(request.url, {
            method: request.method,
            headers,
            body,
            followRedirects: request.redirect !== "manual",
            signal: request.signal,
          });
          const resCopy = new Uint8Array(res.body.byteLength);
          resCopy.set(res.body);
          return new Response(resCopy.buffer, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
        }

        if (this.options.allowDirectNetwork) {
          return fetch(request);
        }

        return new Response(
          "External network disabled in just-bash sandbox. Open a local VFS HTML file, data: URL, or configure `network` on Bash.",
          { status: 403 },
        );
      },
    };
  }

  async getOrCreateSession(name = this.options.defaultSessionName ?? "default"): Promise<BrowserSessionContext> {
    const existing = this.sessions.get(name);
    if (existing && !existing.client.isClosed()) {
      return existing;
    }

    const { fontAssets } = await this.options.ensureAssets();
    const session = createInProcessCdpSession({
      fontAssets,
      runnerFactory: this.options.runnerFactory,
      externalOutbound: this.createOutboundBridge(),
      connectionMode: "browser",
      allowPrivateNetwork: true,
    });
    const client = new CdpClient(session);
    await client.init();
    const ctx: BrowserSessionContext = {
      name,
      client,
      refMap: new RefMap(),
    };
    this.sessions.set(name, ctx);
    return ctx;
  }

  async closeSession(name: string): Promise<void> {
    const existing = this.sessions.get(name);
    if (!existing) return;
    this.sessions.delete(name);
    await existing.client.close();
  }

  async closeAll(): Promise<void> {
    const entries = Array.from(this.sessions.values());
    this.sessions.clear();
    await Promise.allSettled(entries.map((s) => s.client.close()));
  }

  listSessionNames(): string[] {
    return Array.from(this.sessions.keys());
  }
}

export interface AgentBrowserPlugin {
  /** `just-bash` Command object (`name === "agent-browser"`) for `customCommands` or `bash.registerCommand(...)`. */
  command: Command;
  /** Session and CDP lifecycle manager bound to this plugin instance. */
  manager: JustBrowserManager;
  /** Close all active Kitesurf WASM browser sessions managed by this plugin. */
  close(): Promise<void>;
}

export interface BashCommandTarget {
  registerCommand(command: Command): void;
}

export function createPluginFromManagerOptions(
  managerOptions: JustBrowserManagerOptions,
): AgentBrowserPlugin {
  const manager = new JustBrowserManager(managerOptions);
  const command = createAgentBrowserCommand(manager);
  return {
    command,
    manager,
    close: () => manager.closeAll(),
  };
}

export function createAgentBrowserCommand(manager: JustBrowserManager): Command {
  return defineCommand("agent-browser", async (args, ctx) => {
    manager.bindCommandContext(ctx.fs, ctx.fetch);
    const defaultSession = ctx.env.get("AGENT_BROWSER_SESSION") ?? "default";
    const parsed = parseCliArgs(args, defaultSession);
    try {
      const stdout = await executeAgentBrowser(parsed, {
        sessionName: parsed.sessionName,
        getOrCreateSession: () => manager.getOrCreateSession(parsed.sessionName),
        closeSession: () => manager.closeSession(parsed.sessionName),
        virtualOrigin: VIRTUAL_FS_ORIGIN,
        fs: {
          cwd: ctx.cwd,
          resolvePath: (base, target) => ctx.fs.resolvePath(base, target),
          exists: (p) => ctx.fs.exists(p),
          readFile: (p) => ctx.fs.readFile(p),
          readFileBuffer: (p) => ctx.fs.readFileBuffer(p),
          writeFile: (p, content) => ctx.fs.writeFile(p, content),
        },
      });
      return { stdout, stderr: "", exitCode: 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (parsed.json) {
        return {
          stdout: JSON.stringify({ success: false, error: message }, null, 2) + "\n",
          stderr: "",
          exitCode: 1,
        };
      }
      return {
        stdout: "",
        stderr: `agent-browser: ${message}\n`,
        exitCode: 1,
      };
    }
  });
}
