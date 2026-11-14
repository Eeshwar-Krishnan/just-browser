/**
 * `agent-browser` command dispatcher translating CLI arguments into Kitesurf CDP actions.
 */

import type { Protocol } from "devtools-protocol";
import { uint8ArrayFromBase64 } from "../kitesurf/shims/base64-polyfill.ts";
import type { CdpClient } from "./cdp-client.ts";
import {
  callOnElement,
  clickElement,
  fillElement,
  focusElement,
  getElementBox,
  hoverElement,
  pressKey,
  resolveTargetElement,
  selectOption,
  setChecked,
} from "./element-actions.ts";
import type { RefMap } from "./ref-map.ts";
import { takeSnapshot, type SnapshotOptions } from "./snapshot.ts";

export interface BrowserSessionContext {
  name: string;
  client: CdpClient;
  refMap: RefMap;
}

export interface FilesystemBridge {
  cwd: string;
  resolvePath(base: string, target: string): string;
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  readFileBuffer?(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
}

export interface RunCommandDeps {
  sessionName: string;
  getOrCreateSession: () => Promise<BrowserSessionContext>;
  closeSession: () => Promise<void>;
  fs: FilesystemBridge;
  virtualOrigin: string;
}

export interface ParsedGlobalFlags {
  json: boolean;
  sessionName: string;
  headersJson?: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

const VALUE_FLAGS = new Set([
  "--session",
  "--headers",
  "-s",
  "--selector",
  "-d",
  "--depth",
  "--max-depth",
  "--text",
  "--url",
  "--load",
  "--timeout",
  "-o",
  "--output",
]);

export function parseCliArgs(args: string[], defaultSession = "default"): ParsedGlobalFlags {
  let json = false;
  let sessionName = defaultSession;
  let headersJson: string | undefined;
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--session" && i + 1 < args.length) {
      sessionName = args[++i]!;
      continue;
    }
    if (arg.startsWith("--session=")) {
      sessionName = arg.slice("--session=".length);
      continue;
    }
    if (arg === "--headers" && i + 1 < args.length) {
      headersJson = args[++i]!;
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags.set(arg.slice(0, eq), arg.slice(eq + 1));
      } else if (VALUE_FLAGS.has(arg) && i + 1 < args.length && !args[i + 1]!.startsWith("-")) {
        flags.set(arg, args[++i]!);
      } else {
        flags.set(arg, true);
      }
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      if (VALUE_FLAGS.has(arg) && i + 1 < args.length) {
        flags.set(arg, args[++i]!);
      } else {
        // Expand short bundled flags e.g. -ic -> -i, -c
        for (const ch of arg.slice(1)) {
          flags.set(`-${ch}`, true);
        }
      }
      continue;
    }
    positionals.push(arg);
  }

  return { json, sessionName, headersJson, positionals, flags };
}

function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("about:") ||
    trimmed.startsWith("file://")
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function isLocalPathCandidate(raw: string): boolean {
  if (raw.startsWith("file://")) return true;
  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return true;
  if (/\.(html?|xhtml|svg|txt)(\?|#|$)/i.test(raw) && !raw.includes("://")) return true;
  return false;
}

function formatSuccess(data: unknown, text: string, jsonMode: boolean): string {
  if (jsonMode) {
    return JSON.stringify({ success: true, data }, null, 2) + "\n";
  }
  return text.endsWith("\n") ? text : text + "\n";
}

function requireArg(val: string | undefined, message: string): string {
  if (!val) throw new Error(message);
  return val;
}

const HELP_TEXT = `agent-browser (powered by Cloudflare Kitesurf WASM + just-bash)

Usage: agent-browser [options] <command> [args...]

Navigation:
  open, goto <url|file>      Navigate to URL or local just-bash VFS file
  back                       Go back in history
  forward                    Go forward in history
  reload                     Reload current page
  close                      Close current browser session

Snapshot & Inspection:
  snapshot [-i] [-c] [-C] [-d N] [-s sel] [--urls]
                             Capture accessibility tree & assign @eN refs
  get <text|html|value|attr|title|url|count|box> <sel|@ref> [attrName]
  is <visible|enabled|checked> <sel|@ref>
  find <role|text|label|placeholder|testid> <query> [action] [value]

Interactions:
  click <sel|@ref>           Click element
  dblclick <sel|@ref>        Double-click element
  hover <sel|@ref>           Hover element
  focus <sel|@ref>           Focus element
  fill <sel|@ref> <text>     Clear and fill input
  type <sel|@ref> <text>     Append text to input
  press <key>                Dispatch key press (Enter, Tab, Escape, ...)
  select <sel|@ref> <v...>   Select <option> by value or label
  check <sel|@ref>           Check checkbox/radio
  uncheck <sel|@ref>         Uncheck checkbox
  scroll <dir> [px]          Scroll page (up|down|left|right)
  scrollintoview <sel|@ref>  Scroll element into view

Evaluate & Capture:
  eval <js>                  Evaluate JavaScript in page context
  screenshot [path]          Save PNG screenshot into just-bash VFS
  pdf [path]                 Save rendered PDF into just-bash VFS

Browser State:
  wait <ms|sel|@ref>         Wait milliseconds or until selector matches
  tab [new [url]|list|close|<idx>]
  cookies [get|set <name> <val>|clear]
  storage <local|session> [get|set|clear]
  console [--clear]          Read console messages
  errors [--clear]           Read page exceptions
  set viewport <w> <h>       Resize viewport
  set ua <userAgent>         Override User-Agent
  set headers <json>         Set extra HTTP headers
  session                    Show active session info

Global options:
  --json                     Emit structured JSON responses
  --session <name>           Use named isolated browser session
`;

export async function executeAgentBrowser(
  parsed: ParsedGlobalFlags,
  deps: RunCommandDeps,
): Promise<string> {
  const [rawCmd, ...rest] = parsed.positionals;
  if (!rawCmd || rawCmd === "help" || parsed.flags.has("--help") || parsed.flags.has("-h")) {
    return formatSuccess({ help: true }, HELP_TEXT, parsed.json);
  }
  const cmd = rawCmd.toLowerCase();

  if (cmd === "close" || cmd === "quit" || cmd === "exit") {
    await deps.closeSession();
    return formatSuccess({ closed: true, session: deps.sessionName }, `Session "${deps.sessionName}" closed.`, parsed.json);
  }

  const sess = await deps.getOrCreateSession();
  const { client, refMap } = sess;

  if (parsed.headersJson) {
    const headers = JSON.parse(parsed.headersJson) as Record<string, string>;
    await client.send("Network.setExtraHTTPHeaders", { headers });
  }

  switch (cmd) {
    case "open":
    case "goto":
    case "navigate": {
      const targetInput = requireArg(rest[0], "Usage: open <url|path>");
      let targetUrl: string;
      if (isLocalPathCandidate(targetInput)) {
        const rawPath = targetInput.startsWith("file://")
          ? decodeURIComponent(targetInput.slice("file://".length))
          : targetInput;
        const resolvedPath = deps.fs.resolvePath(deps.fs.cwd, rawPath);
        if (!(await deps.fs.exists(resolvedPath))) {
          throw new Error(`File not found in virtual filesystem: ${resolvedPath}`);
        }
        const cleanPath = resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`;
        targetUrl = `${deps.virtualOrigin}${cleanPath}`;
      } else {
        targetUrl = normalizeUrlInput(targetInput);
      }

      const navRes = await client.send<{ frameId?: string; errorText?: string }>("Page.navigate", {
        url: targetUrl,
      });
      if (navRes.errorText) {
        throw new Error(`Navigation failed: ${navRes.errorText}`);
      }
      refMap.clear();
      const title = await client.evaluate<string>("document.title || ''").catch(() => "");
      const url = await client.evaluate<string>("location.href").catch(() => targetUrl);
      client.activeTab.title = title;
      client.activeTab.url = url;
      return formatSuccess({ url, title }, `${title ? `${title}\n` : ""}${url}`, parsed.json);
    }

    case "back": {
      const hist = await client.send<{
        currentIndex: number;
        entries: Array<{ id: number; url: string; title: string }>;
      }>("Page.getNavigationHistory");
      if (hist.currentIndex <= 0) {
        return formatSuccess({ moved: false }, "Already at earliest history entry.", parsed.json);
      }
      const prev = hist.entries[hist.currentIndex - 1]!;
      await client.send("Page.navigateToHistoryEntry", { entryId: prev.id });
      refMap.clear();
      const url = await client.evaluate<string>("location.href").catch(() => prev.url);
      return formatSuccess({ url }, url, parsed.json);
    }

    case "forward": {
      const hist = await client.send<{
        currentIndex: number;
        entries: Array<{ id: number; url: string; title: string }>;
      }>("Page.getNavigationHistory");
      if (hist.currentIndex + 1 >= hist.entries.length) {
        return formatSuccess({ moved: false }, "Already at latest history entry.", parsed.json);
      }
      const next = hist.entries[hist.currentIndex + 1]!;
      await client.send("Page.navigateToHistoryEntry", { entryId: next.id });
      refMap.clear();
      const url = await client.evaluate<string>("location.href").catch(() => next.url);
      return formatSuccess({ url }, url, parsed.json);
    }

    case "reload": {
      await client.send("Page.reload", {});
      refMap.clear();
      const url = await client.evaluate<string>("location.href").catch(() => client.activeTab.url);
      return formatSuccess({ reloaded: true, url }, `Reloaded ${url}`, parsed.json);
    }

    case "snapshot": {
      const depthRaw = parsed.flags.get("-d") ?? parsed.flags.get("--depth") ?? parsed.flags.get("--max-depth");
      const maxDepth = typeof depthRaw === "string" ? Number.parseInt(depthRaw, 10) : undefined;
      const selectorFlag = parsed.flags.get("-s") ?? parsed.flags.get("--selector");
      const opts: SnapshotOptions = {
        interactive: parsed.flags.has("-i") || parsed.flags.has("--interactive"),
        compact: parsed.flags.has("-c") || parsed.flags.has("--compact"),
        cursor: parsed.flags.has("-C") || parsed.flags.has("--cursor"),
        urls: parsed.flags.has("--urls"),
        maxDepth: Number.isFinite(maxDepth) ? maxDepth : undefined,
        selector: typeof selectorFlag === "string" ? selectorFlag : undefined,
      };
      const snap = await takeSnapshot(client, refMap, opts);
      return formatSuccess(
        { snapshot: snap.tree, refs: snap.refs, stats: snap.stats },
        snap.tree,
        parsed.json,
      );
    }

    case "click": {
      const target = requireArg(rest[0], "Usage: click <selector|@ref>");
      await clickElement(client, refMap, target, 1);
      return formatSuccess({ clicked: target }, `Clicked ${target}`, parsed.json);
    }

    case "dblclick": {
      const target = requireArg(rest[0], "Usage: dblclick <selector|@ref>");
      await clickElement(client, refMap, target, 2);
      return formatSuccess({ dblclicked: target }, `Double-clicked ${target}`, parsed.json);
    }

    case "hover": {
      const target = requireArg(rest[0], "Usage: hover <selector|@ref>");
      await hoverElement(client, refMap, target);
      return formatSuccess({ hovered: target }, `Hovered ${target}`, parsed.json);
    }

    case "focus": {
      const target = requireArg(rest[0], "Usage: focus <selector|@ref>");
      await focusElement(client, refMap, target);
      return formatSuccess({ focused: target }, `Focused ${target}`, parsed.json);
    }

    case "fill": {
      const target = requireArg(rest[0], "Usage: fill <selector|@ref> <value>");
      const text = rest.slice(1).join(" ");
      await fillElement(client, refMap, target, text, true);
      return formatSuccess({ filled: target, value: text }, `Filled ${target}`, parsed.json);
    }

    case "type": {
      const target = requireArg(rest[0], "Usage: type <selector|@ref> <text>");
      const text = rest.slice(1).join(" ");
      await fillElement(client, refMap, target, text, false);
      return formatSuccess({ typed: target, text }, `Typed into ${target}`, parsed.json);
    }

    case "press":
    case "key": {
      const key = requireArg(rest[0], "Usage: press <key>");
      await pressKey(client, key);
      return formatSuccess({ pressed: key }, `Pressed ${key}`, parsed.json);
    }

    case "select": {
      const target = requireArg(rest[0], "Usage: select <selector|@ref> <value...>");
      const values = rest.slice(1);
      if (values.length === 0) throw new Error("Usage: select <selector|@ref> <value...>");
      const selected = await selectOption(client, refMap, target, values);
      return formatSuccess({ selected }, selected.join(", "), parsed.json);
    }

    case "check": {
      const target = requireArg(rest[0], "Usage: check <selector|@ref>");
      const checked = await setChecked(client, refMap, target, true);
      return formatSuccess({ checked }, `Checked: ${checked}`, parsed.json);
    }

    case "uncheck": {
      const target = requireArg(rest[0], "Usage: uncheck <selector|@ref>");
      const checked = await setChecked(client, refMap, target, false);
      return formatSuccess({ checked }, `Checked: ${checked}`, parsed.json);
    }

    case "scroll": {
      const dir = (rest[0] ?? "down").toLowerCase();
      const amount = Number.parseInt(rest[1] ?? "300", 10) || 300;
      const dx = dir === "right" ? amount : dir === "left" ? -amount : 0;
      const dy = dir === "down" ? amount : dir === "up" ? -amount : 0;
      const pos = await client.evaluate<{ x: number; y: number }>(
        `(() => { window.scrollBy(${dx}, ${dy}); return { x: window.scrollX || 0, y: window.scrollY || 0 }; })()`,
      );
      return formatSuccess(pos, `Scrolled to (${pos.x}, ${pos.y})`, parsed.json);
    }

    case "scrollintoview": {
      const target = requireArg(rest[0], "Usage: scrollintoview <selector|@ref>");
      const el = await resolveTargetElement(client, refMap, target);
      try {
        await callOnElement(
          client,
          el,
          "function() { if (typeof this.scrollIntoView === 'function') this.scrollIntoView({ block: 'center' }); }",
        );
      } finally {
        await el.release();
      }
      return formatSuccess({ scrolledIntoView: target }, `Scrolled ${target} into view`, parsed.json);
    }

    case "get": {
      const sub = requireArg(rest[0], "Usage: get <text|html|value|attr|title|url|count|box> ...").toLowerCase();
      if (sub === "title") {
        const title = await client.evaluate<string>("document.title || ''");
        return formatSuccess({ title }, title, parsed.json);
      }
      if (sub === "url") {
        const url = await client.evaluate<string>("location.href");
        return formatSuccess({ url }, url, parsed.json);
      }
      const target = requireArg(rest[1], `Usage: get ${sub} <selector|@ref>`);
      if (sub === "count") {
        const count = await client.evaluate<number>(
          `document.querySelectorAll(${JSON.stringify(target)}).length`,
        );
        return formatSuccess({ count }, String(count), parsed.json);
      }
      const el = await resolveTargetElement(client, refMap, target);
      try {
        if (sub === "text") {
          const text = await callOnElement<string>(client, el, "function() { return (this.textContent || '').trim(); }");
          return formatSuccess({ text }, text, parsed.json);
        }
        if (sub === "html") {
          const html = await callOnElement<string>(client, el, "function() { return this.innerHTML || ''; }");
          return formatSuccess({ html }, html, parsed.json);
        }
        if (sub === "value") {
          const value = await callOnElement<string>(client, el, "function() { return String(this.value ?? ''); }");
          return formatSuccess({ value }, value, parsed.json);
        }
        if (sub === "attr") {
          const attrName = requireArg(rest[2], "Usage: get attr <selector|@ref> <attribute>");
          const value = await callOnElement<string | null>(
            client,
            el,
            "function(name) { return this.getAttribute ? this.getAttribute(name) : null; }",
            [attrName],
          );
          return formatSuccess({ attribute: attrName, value }, value ?? "", parsed.json);
        }
        if (sub === "box") {
          const box = await getElementBox(client, el);
          return formatSuccess(box, JSON.stringify(box), parsed.json);
        }
        throw new Error(`Unknown get subcommand: ${sub}`);
      } finally {
        await el.release();
      }
    }

    case "is": {
      const sub = requireArg(rest[0], "Usage: is <visible|enabled|checked> <selector|@ref>").toLowerCase();
      const target = requireArg(rest[1], `Usage: is ${sub} <selector|@ref>`);
      const el = await resolveTargetElement(client, refMap, target);
      try {
        let result = false;
        if (sub === "visible") {
          const box = await getElementBox(client, el);
          const styleHidden = await callOnElement<boolean>(
            client,
            el,
            `function() {
              if (this.hasAttribute && this.hasAttribute("hidden")) return true;
              const s = typeof getComputedStyle === "function" ? getComputedStyle(this) : null;
              return s ? (s.display === "none" || s.visibility === "hidden") : false;
            }`,
          );
          result = !styleHidden && (box.width > 0 || box.height > 0);
        } else if (sub === "enabled") {
          result = await callOnElement<boolean>(client, el, "function() { return !this.disabled; }");
        } else if (sub === "checked") {
          result = await callOnElement<boolean>(client, el, "function() { return Boolean(this.checked); }");
        } else {
          throw new Error(`Unknown is subcommand: ${sub}`);
        }
        return formatSuccess({ [sub]: result }, String(result), parsed.json);
      } finally {
        await el.release();
      }
    }

    case "eval":
    case "evaluate": {
      const expr = requireArg(rest.join(" ").trim(), "Usage: eval <expression>");
      const value = await client.evaluate<unknown>(expr, true);
      const rendered =
        value === undefined ? "undefined" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
      return formatSuccess({ result: value }, rendered, parsed.json);
    }

    case "screenshot": {
      const fullPage = parsed.flags.has("--full") || parsed.flags.has("-f");
      let clip: Protocol.Page.Viewport | undefined;
      if (fullPage) {
        const metrics = await client.send<Protocol.Page.GetLayoutMetricsResponse>("Page.getLayoutMetrics");
        const size = metrics.contentSize;
        if (size && size.width > 0 && size.height > 0) {
          clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
        }
      }
      const res = await client.send<Protocol.Page.CaptureScreenshotResponse>("Page.captureScreenshot", {
        format: "png",
        ...(clip ? { clip } : {}),
      });
      const bytes = uint8ArrayFromBase64(res.data);
      const outArg = rest[0] ?? `screenshot-${Date.now()}.png`;
      const resolvedOut = deps.fs.resolvePath(deps.fs.cwd, outArg);
      await deps.fs.writeFile(resolvedOut, bytes);
      return formatSuccess(
        { path: resolvedOut, bytes: bytes.byteLength },
        `Saved screenshot to ${resolvedOut} (${bytes.byteLength} bytes)`,
        parsed.json,
      );
    }

    case "pdf": {
      const res = await client.send<{ data: string }>("Page.printToPDF", {});
      const bytes = uint8ArrayFromBase64(res.data);
      const outArg = rest[0] ?? `page-${Date.now()}.pdf`;
      const resolvedOut = deps.fs.resolvePath(deps.fs.cwd, outArg);
      await deps.fs.writeFile(resolvedOut, bytes);
      return formatSuccess(
        { path: resolvedOut, bytes: bytes.byteLength },
        `Saved PDF to ${resolvedOut} (${bytes.byteLength} bytes)`,
        parsed.json,
      );
    }

    case "wait": {
      const arg = rest[0];
      if (!arg && parsed.flags.has("--text")) {
        const txt = String(parsed.flags.get("--text"));
        await pollUntil(async () =>
          client.evaluate<boolean>(`(document.body?.innerText || "").includes(${JSON.stringify(txt)})`),
        );
        return formatSuccess({ waitedForText: txt }, `Text appeared: ${txt}`, parsed.json);
      }
      if (!arg && parsed.flags.has("--url")) {
        const pattern = String(parsed.flags.get("--url"));
        await pollUntil(async () =>
          client.evaluate<boolean>(`location.href.includes(${JSON.stringify(pattern)})`),
        );
        return formatSuccess({ waitedForUrl: pattern }, `URL matched: ${pattern}`, parsed.json);
      }
      if (!arg) throw new Error("Usage: wait <ms|selector|@ref>");
      if (/^\d+$/.test(arg)) {
        const ms = Number.parseInt(arg, 10);
        await new Promise((r) => setTimeout(r, ms));
        return formatSuccess({ waitedMs: ms }, `Waited ${ms}ms`, parsed.json);
      }
      await pollUntil(async () => {
        try {
          const el = await resolveTargetElement(client, refMap, arg);
          await el.release();
          return true;
        } catch {
          return false;
        }
      });
      return formatSuccess({ found: arg }, `Element ready: ${arg}`, parsed.json);
    }

    case "tab": {
      const sub = (rest[0] ?? "list").toLowerCase();
      if (sub === "list") {
        const tabs = client.listTabs().map((t, idx) => ({
          index: idx,
          active: idx === client.activeTabIdx,
          url: t.url,
          title: t.title,
        }));
        const txt = tabs.map((t) => `${t.active ? "*" : " "} [${t.index}] ${t.title || t.url}`).join("\n");
        return formatSuccess({ tabs }, txt, parsed.json);
      }
      if (sub === "new") {
        const created = await client.newTab(rest[1] ? normalizeUrlInput(rest[1]) : "about:blank");
        refMap.clear();
        return formatSuccess(created, `Opened tab [${created.index}]`, parsed.json);
      }
      if (sub === "close") {
        const idx = rest[1] !== undefined ? Number.parseInt(rest[1], 10) : undefined;
        await client.closeTab(idx);
        refMap.clear();
        return formatSuccess({ closed: true, activeTab: client.activeTabIdx }, "Closed tab", parsed.json);
      }
      if (/^\d+$/.test(sub)) {
        const switched = client.switchTab(Number.parseInt(sub, 10));
        refMap.clear();
        return formatSuccess({ activeTab: Number.parseInt(sub, 10), tab: switched }, `Switched to tab [${sub}]`, parsed.json);
      }
      throw new Error(`Unknown tab command: ${sub}`);
    }

    case "cookies": {
      const sub = (rest[0] ?? "get").toLowerCase();
      if (sub === "get") {
        const res = await client.send<{ cookies: Protocol.Network.Cookie[] }>("Network.getAllCookies");
        return formatSuccess({ cookies: res.cookies }, JSON.stringify(res.cookies, null, 2), parsed.json);
      }
      if (sub === "set") {
        const name = requireArg(rest[1], "Usage: cookies set <name> <value>");
        const value = requireArg(rest[2], "Usage: cookies set <name> <value>");
        const url = await client.evaluate<string>("location.href").catch(() => "https://example.com/");
        await client.send("Network.setCookie", { name, value, url });
        return formatSuccess({ set: name }, `Set cookie ${name}`, parsed.json);
      }
      if (sub === "clear") {
        await client.send("Network.clearBrowserCookies");
        return formatSuccess({ cleared: true }, "Cleared cookies", parsed.json);
      }
      throw new Error(`Unknown cookies subcommand: ${sub}`);
    }

    case "storage": {
      const area = (rest[0] ?? "local").toLowerCase();
      const obj = area === "session" ? "sessionStorage" : "localStorage";
      const op = (rest[1] ?? "get").toLowerCase();
      if (op === "get") {
        const key = rest[2];
        if (key) {
          const val = await client.evaluate<string | null>(`${obj}.getItem(${JSON.stringify(key)})`);
          return formatSuccess({ key, value: val }, val ?? "", parsed.json);
        }
        const entries = await client.evaluate<Record<string, string>>(
          `(() => { const o = {}; for (let i = 0; i < ${obj}.length; i++) { const k = ${obj}.key(i); o[k] = ${obj}.getItem(k); } return o; })()`,
        );
        return formatSuccess({ entries }, JSON.stringify(entries, null, 2), parsed.json);
      }
      if (op === "set") {
        const k = requireArg(rest[2], `Usage: storage ${area} set <key> <value>`);
        const v = requireArg(rest[3], `Usage: storage ${area} set <key> <value>`);
        await client.evaluate(`${obj}.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`);
        return formatSuccess({ key: k, value: v }, `Set ${area}Storage[${k}]`, parsed.json);
      }
      if (op === "clear") {
        await client.evaluate(`${obj}.clear()`);
        return formatSuccess({ cleared: area }, `Cleared ${area}Storage`, parsed.json);
      }
      throw new Error(`Unknown storage op: ${op}`);
    }

    case "console": {
      const clear = parsed.flags.has("--clear");
      const logs = client.getConsole(clear);
      const txt = logs.map((l) => `[${l.type}] ${l.text}`).join("\n");
      return formatSuccess({ messages: logs }, txt || "(no console output)", parsed.json);
    }

    case "errors": {
      const clear = parsed.flags.has("--clear");
      const errs = client.getErrors(clear);
      const txt = errs.map((e) => e.message).join("\n");
      return formatSuccess({ errors: errs }, txt || "(no page errors)", parsed.json);
    }

    case "set": {
      const what = requireArg(rest[0], "Usage: set <viewport|ua|headers> ...").toLowerCase();
      if (what === "viewport") {
        const w = Number.parseInt(requireArg(rest[1], "Usage: set viewport <w> <h>"), 10);
        const h = Number.parseInt(requireArg(rest[2], "Usage: set viewport <w> <h>"), 10);
        await client.send("Emulation.setDeviceMetricsOverride", {
          width: w,
          height: h,
          deviceScaleFactor: 1,
          mobile: false,
        });
        return formatSuccess({ width: w, height: h }, `Viewport set to ${w}x${h}`, parsed.json);
      }
      if (what === "ua") {
        const userAgent = requireArg(rest.slice(1).join(" "), "Usage: set ua <userAgent>");
        await client.send("Network.setUserAgentOverride", { userAgent });
        return formatSuccess({ userAgent }, `User-Agent set`, parsed.json);
      }
      if (what === "headers") {
        const headers = JSON.parse(requireArg(rest.slice(1).join(" "), "Usage: set headers <json>")) as Record<string, string>;
        await client.send("Network.setExtraHTTPHeaders", { headers });
        return formatSuccess({ headers }, `Extra headers updated`, parsed.json);
      }
      throw new Error(`Unknown set target: ${what}`);
    }

    case "find": {
      const by = requireArg(rest[0], "Usage: find <role|text|label|placeholder|testid> <query> [action] [value]").toLowerCase();
      const query = requireArg(rest[1], "Usage: find <by> <query> [action] [value]");
      const action = rest[2]?.toLowerCase() ?? "text";
      const val = rest.slice(3).join(" ");
      const foundId = await findElementSelector(client, by, query);
      if (action === "click") {
        await clickElement(client, refMap, foundId, 1);
        return formatSuccess({ found: foundId, action: "click" }, `Clicked ${foundId}`, parsed.json);
      }
      if (action === "fill") {
        await fillElement(client, refMap, foundId, val, true);
        return formatSuccess({ found: foundId, action: "fill" }, `Filled ${foundId}`, parsed.json);
      }
      const text = await client.evaluate<string>(
        `(document.querySelector(${JSON.stringify(foundId)})?.textContent || "").trim()`,
      );
      return formatSuccess({ selector: foundId, text }, text, parsed.json);
    }

    case "session": {
      return formatSuccess(
        { session: deps.sessionName, url: client.activeTab.url, tabs: client.listTabs().length },
        `session=${deps.sessionName} tabs=${client.listTabs().length} url=${client.activeTab.url}`,
        parsed.json,
      );
    }

    default:
      throw new Error(`Unknown agent-browser command: ${rawCmd}. Run \`agent-browser --help\` for usage.`);
  }
}

async function findElementSelector(client: CdpClient, by: string, query: string): Promise<string> {
  const attrExpr = (() => {
    switch (by) {
      case "testid":
        return `document.querySelector('[data-testid=' + JSON.stringify(q) + ']')`;
      case "placeholder":
        return `document.querySelector('[placeholder=' + JSON.stringify(q) + ']')`;
      case "label":
        return `(() => {
          for (const lbl of document.querySelectorAll("label")) {
            if ((lbl.textContent || "").trim().includes(q)) {
              const id = lbl.getAttribute("for");
              if (id) return document.getElementById(id);
              return lbl.querySelector("input,select,textarea");
            }
          }
          return document.querySelector('[aria-label=' + JSON.stringify(q) + ']');
        })()`;
      case "role":
        return `document.querySelector('[role=' + JSON.stringify(q) + '], ' + (q === 'button' ? 'button' : q === 'link' ? 'a[href]' : q === 'textbox' ? 'input,textarea' : q))`;
      default:
        return `(() => {
          for (const el of document.querySelectorAll("button,a,input,label,[role],h1,h2,h3,p,span,div,li")) {
            if ((el.textContent || "").trim().includes(q)) return el;
          }
          return null;
        })()`;
    }
  })();

  const sel = await client.evaluate<string | null>(`(() => {
    const q = ${JSON.stringify(query)};
    const el = ${attrExpr};
    if (!el) return null;
    if (!el.getAttribute("data-kb-found")) {
      el.setAttribute("data-kb-found", ${JSON.stringify(query)});
    }
    return '[data-kb-found=' + JSON.stringify(${JSON.stringify(query)}) + ']';
  })()`);
  if (!sel) throw new Error(`Could not find element by ${by}=${query}`);
  return sel;
}

async function pollUntil(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}
