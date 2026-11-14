# just-browser

A 100% WASMable, in-process browser environment that injects handles into `just-bash` to run `agent-browser` in virtualized bash environments. Built on the Cloudflare Kitesurf browser.

`just-browser` registers an `agent-browser` command inside `just-bash` backed by Kitesurf running directly in the host JavaScript runtime.

## Architecture

```
just-bash (virtual bash + VFS + SecureFetch sandbox)
   └── agent-browser command (CLI flags, @eN ref map, accessibility snapshots)
         └── CdpClient (multi-tab CDP multiplexing, console & page error buffering)
               └── In-process Kitesurf CDP host (dispatch(), BrowserState, CookieJar)
                     ├── InProcessWorkerLoader (node:vm in Node / scoped Function+eval in browsers)
                     └── kitesurf_core_bg.wasm + renderer_core_bg.wasm
                           (html5ever, Stylo/Taffy layout, Vello/tiny-skia PNG, krilla PDF, Boa fallback)
```

- **Zero external browser binaries**: Including zero Chromium or Playwright browser downloads
- **VFS-native serving**: Navigating to `/app/index.html` or `./page.html` maps cleanly to `http://vfs.just-browser.local/...` backed directly by `just-bash`'s virtual filesystem (`IFileSystem`), including relative `<script>`, `<link>`, and static asset loads.
- **Sandboxed HTTP traffic**: Non-VFS HTTP(S) requests flow through an optional `externalFetch`, or `just-bash`'s `SecureFetch` (`bash.network` allow-list), or fail closed (`403`) unless `allowDirectNetwork: true` is configured.
- **Dual runtime targets**:
  - `just-browser` (`dist/index.js`): Node.js runtime (`>=24`) using `node:vm` contexts for per-isolate execution.
  - `just-browser/browser` (`dist/browser.js`): Pure-browser / WASM-host bundle with zero `node:*` shims required for Kitesurf.

## Requirements

- **Node.js `>=24`** (uses native WebAssembly `exnref` / exception-handling support required by Kitesurf's compiled `.wasm` modules without experimental flags).

## Installation & Build

```bash
npm install
npm run build:kitesurf
npm run build
```

## Programmatic Usage (Node.js)

```ts
import { createJustBrowser } from "just-browser";

const jb = createJustBrowser({
  bash: {
    network: {
      allowedUrlPrefixes: ["https://example.com/"],
    },
  },
});

await jb.exec(`
  cat << 'EOF' > /index.html
  <!doctype html>
  <html>
    <head><title>Demo</title></head>
    <body>
      <h1>Hello WASM</h1>
      <button onclick="document.getElementById('out').textContent = 'Clicked'">Run</button>
      <p id="out">idle</p>
    </body>
  </html>
EOF
`);

await jb.exec("agent-browser open /index.html");
const snap = await jb.exec("agent-browser snapshot -i");
console.log(snap.stdout); // - button "Run" [ref=e1]

await jb.exec("agent-browser click @e1");
const text = await jb.exec('agent-browser get text "#out"');
console.log(text.stdout.trim()); // Clicked

await jb.exec("agent-browser screenshot /out.png");
await jb.exec("agent-browser pdf /out.pdf");

await jb.close();
```

## Injecting Into an Existing `just-bash` Instance (or Adding Other Tools)

Use `attachAgentBrowser` or `createAgentBrowserPlugin` when integrating `agent-browser` into an existing `Bash` instance alongside other custom commands (sharing the host shell's VFS and `SecureFetch` network sandbox):

```ts
import { Bash, defineCommand } from "just-bash";
import { attachAgentBrowser, createAgentBrowserPlugin } from "just-browser";

const otherTool = defineCommand("render-report", async (_args, ctx) => {
  await ctx.fs.writeFile("/report.html", "<title>Report</title><button>Export</button>");
  return { stdout: "/report.html\n", stderr: "", exitCode: 0 };
});

// Option A: Register onto an existing Bash instance
const bash = new Bash({ customCommands: [otherTool] });
const browser = attachAgentBrowser(bash);

await bash.exec("file=$(render-report) && agent-browser open \"$file\" && agent-browser snapshot -i");
await browser.close();

// Option B: Pass plugin.command at Bash construction time
const plugin = createAgentBrowserPlugin();
const bash2 = new Bash({ customCommands: [otherTool, plugin.command] });
await plugin.close();
```

The same helpers (`attachAgentBrowser(bash, { assets, ... })` and `createAgentBrowserPlugin({ assets, ... })`) are exported from `just-browser/browser` for existing `just-bash/browser` instances.

To inject extra tools into an existing `createJustBrowser()` instance, pass `customCommands: [...]` at creation time or call `jb.bash.registerCommand(myCommand)` on `jb.bash`.

## Pure-Browser Usage (`just-browser/browser`)

In a web browser, Web Worker, or non-Node JS host, supply the WASM binaries and fonts (as `Uint8Array`, `ArrayBuffer`, or fetch URLs):

```ts
import { createJustBrowser } from "just-browser/browser";

const jb = createJustBrowser({
  assets: {
    coreWasm: "/assets/wasm/kitesurf_core_bg.wasm",
    rendererWasm: "/assets/wasm/renderer_core_bg.wasm",
    fonts: "/assets/fonts/",
  },
});

await jb.exec('echo "<title>Web</title><button>Hi</button>" > /index.html');
const res = await jb.exec("agent-browser open /index.html && agent-browser snapshot -i");
console.log(res.stdout);
await jb.close();
```

## CLI Usage

```bash
# Run an inline bash script with agent-browser preinstalled
just-browser -c 'echo "<title>Hi</title><button>Go</button>" > /p.html && agent-browser open /p.html && agent-browser snapshot -i'

# Pipe a script via stdin
printf 'agent-browser --help\n' | just-browser

# Allow external HTTPS requests matching a prefix
just-browser --allow-url https://example.com -c 'agent-browser open https://example.com'

# Start an interactive line-oriented REPL
just-browser
```

## Supported `agent-browser` Subcommands

- **Navigation**: `open` / `goto` `<url|file>`, `back`, `forward`, `reload`, `close`
- **Inspection & Accessibility Refs**:
  - `snapshot [-i] [-c] [-C] [-d N] [-s sel] [--urls]` — builds an accessibility tree with stable `@eN` refs
  - `get <text|html|value|attr|title|url|count|box> <sel|@ref> [attrName]`
  - `is <visible|enabled|checked> <sel|@ref>`
  - `find <role|text|label|placeholder|testid> <query> [action] [value]`
- **Interactions**: `click`, `dblclick`, `hover`, `focus`, `fill`, `type`, `press`, `select`, `check`, `uncheck`, `scroll`, `scrollintoview`
- **Evaluation & Capture**: `eval <js>`, `screenshot [path]`, `pdf [path]`
- **State & Sessions**: `wait <ms|sel|@ref>`, `tab [new [url]|list|close|<idx>]`, `cookies`, `storage <local|session>`, `console [--clear]`, `errors [--clear]`, `set <viewport|ua|headers>`, `session`
- **Global Flags**: `--json`, `--session <name>`

## Development & Testing

```bash
npm run typecheck
npm test
```
