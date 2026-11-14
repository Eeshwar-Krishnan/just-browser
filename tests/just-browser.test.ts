import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Bash, defineCommand } from "just-bash";
import { Bash as BrowserBash } from "just-bash/browser";
import {
  attachAgentBrowser,
  createAgentBrowserPlugin,
  createJustBrowser,
} from "../src/index.ts";
import {
  attachAgentBrowser as attachBrowserAgentBrowser,
  createJustBrowser as createBrowserJustBrowser,
} from "../src/browser.ts";

const execFileAsync = promisify(execFile);

describe("just-browser (just-bash + agent-browser + Kitesurf WASM)", () => {
  const instances: Array<{ close(): Promise<void> }> = [];

  afterAll(async () => {
    await Promise.allSettled(instances.map((i) => i.close()));
  });

  it("drives a full interactive VFS web app, captures screenshot & PDF into just-bash fs, and pipes output", async () => {
    const jb = createJustBrowser();
    instances.push(jb);

    const setup = await jb.exec(`
      mkdir -p /app
      cat << 'EOF' > /app/app.js
      window.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('submit-btn');
        const input = document.getElementById('name-input');
        const agree = document.getElementById('agree-box');
        const out = document.getElementById('result');
        btn.addEventListener('click', () => {
          out.textContent = 'Submitted:' + input.value + ':' + String(agree.checked);
          out.setAttribute('data-done', 'yes');
          console.log('form submitted by ' + input.value);
        });
      });
EOF
      cat << 'EOF' > /app/index.html
      <!doctype html>
      <html>
        <head>
          <title>WASM Test App</title>
          <script src="./app.js"></script>
        </head>
        <body>
          <h1>Signup</h1>
          <label for="name-input">Full Name</label>
          <input id="name-input" type="text" placeholder="Your name" />
          <label><input id="agree-box" type="checkbox" /> Accept Terms</label>
          <button id="submit-btn">Submit Form</button>
          <div id="result">pending</div>
        </body>
      </html>
EOF
    `);
    expect(setup.exitCode).toBe(0);

    const openRes = await jb.exec("agent-browser open /app/index.html");
    expect(openRes.exitCode).toBe(0);
    expect(openRes.stdout).toContain("WASM Test App");

    const snapRes = await jb.exec("agent-browser snapshot -i");
    expect(snapRes.exitCode).toBe(0);
    expect(snapRes.stdout).toContain("textbox");
    expect(snapRes.stdout).toContain("checkbox");
    expect(snapRes.stdout).toContain('button "Submit Form"');

    // Pipe snapshot through standard bash tools inside just-bash
    const grepRes = await jb.exec('agent-browser snapshot -i | grep -c "button"');
    expect(grepRes.exitCode).toBe(0);
    expect(grepRes.stdout.trim()).toBe("1");

    // Extract refs via JSON snapshot to verify durable @eN bindings
    const jsonSnap = await jb.exec("agent-browser --json snapshot -i");
    expect(jsonSnap.exitCode).toBe(0);
    const parsedSnap = JSON.parse(jsonSnap.stdout) as {
      success: boolean;
      data: {
        refs: Record<string, { role: string; name?: string }>;
        stats: { interactive: number };
      };
    };
    expect(parsedSnap.success).toBe(true);
    expect(parsedSnap.data.stats.interactive).toBeGreaterThanOrEqual(3);

    const entries = Object.entries(parsedSnap.data.refs);
    const textboxRef = entries.find(([, v]) => v.role === "textbox")?.[0];
    const checkboxRef = entries.find(([, v]) => v.role === "checkbox")?.[0];
    const buttonRef = entries.find(([, v]) => v.role === "button")?.[0];
    expect(textboxRef).toBeDefined();
    expect(checkboxRef).toBeDefined();
    expect(buttonRef).toBeDefined();

    // Fill, check, click using @eN refs inside bash
    const interact = await jb.exec(`
      agent-browser fill @${textboxRef} "Ada Lovelace"
      agent-browser check @${checkboxRef}
      agent-browser click @${buttonRef}
    `);
    expect(interact.exitCode).toBe(0);

    const resultText = await jb.exec('agent-browser get text "#result"');
    expect(resultText.exitCode).toBe(0);
    expect(resultText.stdout.trim()).toBe("Submitted:Ada Lovelace:true");

    const attrRes = await jb.exec('agent-browser get attr "#result" data-done');
    expect(attrRes.stdout.trim()).toBe("yes");

    const evalRes = await jb.exec('agent-browser eval "1 + 2 + 3"');
    expect(evalRes.stdout.trim()).toBe("6");

    const consoleRes = await jb.exec("agent-browser console");
    expect(consoleRes.stdout).toContain("form submitted by Ada Lovelace");

    // Capture PNG screenshot and PDF directly into just-bash InMemoryFs
    const captureRes = await jb.exec(`
      agent-browser screenshot /app/shot.png
      agent-browser pdf /app/page.pdf
    `);
    expect(captureRes.exitCode).toBe(0);

    const pngBytes = await jb.bash.fs.readFileBuffer("/app/shot.png");
    expect(pngBytes.length).toBeGreaterThan(100);
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);
    expect(pngBytes[2]).toBe(0x4e);
    expect(pngBytes[3]).toBe(0x47);

    const pdfBytes = await jb.bash.fs.readFileBuffer("/app/page.pdf");
    expect(pdfBytes.length).toBeGreaterThan(200);
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("isolates named sessions, supports multi-tab navigation, storage, cookies, and cursor scan", async () => {
    const jb = createJustBrowser();
    instances.push(jb);

    await jb.exec(`
      cat << 'EOF' > /pageA.html
      <!doctype html>
      <html>
        <head><title>Page A</title></head>
        <body>
          <div style="cursor:pointer" onclick="document.title='Clicked Div'">Card Trigger</div>
          <a href="/pageB.html">Next Link</a>
        </body>
      </html>
EOF
      cat << 'EOF' > /pageB.html
      <!doctype html>
      <html><head><title>Page B</title></head><body><h1>Second Page</h1></body></html>
EOF
    `);

    const r1 = await jb.exec(`
      agent-browser --session alpha open /pageA.html
      agent-browser --session beta open /pageB.html
    `);
    expect(r1.exitCode).toBe(0);

    expect((await jb.exec("agent-browser --session alpha get title")).stdout.trim()).toBe("Page A");
    expect((await jb.exec("agent-browser --session beta get title")).stdout.trim()).toBe("Page B");

    // Cursor scan finds clickable <div>
    const cursorSnap = await jb.exec("agent-browser --session alpha snapshot -i -C");
    expect(cursorSnap.stdout).toContain("Card Trigger");
    expect(cursorSnap.stdout).toContain('link "Next Link"');

    // Click link -> navigates to Page B, then back/forward
    await jb.exec('agent-browser --session alpha find text "Next Link" click');
    expect((await jb.exec("agent-browser --session alpha get title")).stdout.trim()).toBe("Page B");
    await jb.exec("agent-browser --session alpha back");
    expect((await jb.exec("agent-browser --session alpha get title")).stdout.trim()).toBe("Page A");

    // LocalStorage & Cookies
    await jb.exec('agent-browser --session alpha storage local set theme dark');
    const theme = await jb.exec("agent-browser --session alpha storage local get theme");
    expect(theme.stdout.trim()).toBe("dark");

    await jb.exec("agent-browser --session alpha cookies set sid abc123");
    const cookies = await jb.exec("agent-browser --session alpha cookies get");
    expect(cookies.stdout).toContain("abc123");

    // Multi-tab
    await jb.exec("agent-browser --session alpha tab new /pageB.html");
    const tabs = await jb.exec("agent-browser --session alpha tab list");
    expect(tabs.stdout).toContain("[0]");
    expect(tabs.stdout).toContain("[1]");
    await jb.exec("agent-browser --session alpha tab 0");
    await jb.exec("agent-browser --session alpha tab close 1");

    // Close session beta explicitly
    const closed = await jb.exec("agent-browser --session beta close");
    expect(closed.stdout).toContain("closed");
  });

  it("routes HTTP traffic through just-bash network sandbox", async () => {
    const targetUrl = "https://mock.just-browser.test/";

    // 1. Default locked-down network blocks external HTTP
    const locked = createJustBrowser({ allowDirectNetwork: false });
    instances.push(locked);
    await locked.exec(`agent-browser open ${targetUrl}`);
    const lockedHtml = await locked.exec('agent-browser eval "document.body.textContent"');
    expect(lockedHtml.stdout).toContain("External network disabled");

    // 2. just-bash network allowlist rejects disallowed origins cleanly before egress
    const allowlisted = createJustBrowser({
      bash: { network: { allowedUrlPrefixes: ["https://allowed.just-browser.test/"] } },
    });
    instances.push(allowlisted);
    const denied = await allowlisted.exec(`agent-browser open https://blocked.just-browser.test/`);
    expect(denied.exitCode).toBe(1);
    expect(denied.stderr).toContain("URL not in allow-list");

    // 3. Custom externalFetch routes full HTTP/HTML/script pipeline inside Kitesurf
    const custom = createJustBrowser({
      externalFetch: async (req) => {
        if (req.url === targetUrl) {
          return new Response(
            '<html><head><title>HTTP Served</title><script src="https://mock.just-browser.test/ext.js"></script></head><body><h1>From Server</h1><p id="msg">init</p></body></html>',
            { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
        if (req.url === "https://mock.just-browser.test/ext.js") {
          return new Response("document.getElementById('msg').textContent = 'ext-loaded';", {
            status: 200,
            headers: { "content-type": "application/javascript" },
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });
    instances.push(custom);
    const nav = await custom.exec(`agent-browser open ${targetUrl}`);
    expect(nav.exitCode).toBe(0);
    expect(nav.stdout).toContain("HTTP Served");
    expect((await custom.exec('agent-browser get text "h1"')).stdout.trim()).toBe("From Server");
    expect((await custom.exec('agent-browser get text "#msg"')).stdout.trim()).toBe("ext-loaded");
  });

  it("executes compiled dist/bin/just-browser.js CLI cleanly", async () => {
    const cliPath = resolve(process.cwd(), "dist/bin/just-browser.js");
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      cliPath,
      "--offline",
      "-c",
      'echo "<html><head><title>CLI Test</title></head><body><button>Ping</button></body></html>" > /cli.html && agent-browser open /cli.html && agent-browser snapshot -i',
    ]);
    expect(stderr).toBe("");
    expect(stdout).toContain("CLI Test");
    expect(stdout).toContain('button "Ping" [ref=e1]');
  });

  it("runs the pure-browser entrypoint without node:vm", async () => {
    const [coreWasm, rendererWasm, fontBytes] = await Promise.all([
      readFile(resolve(process.cwd(), "assets/wasm/kitesurf_core_bg.wasm")),
      readFile(resolve(process.cwd(), "assets/wasm/renderer_core_bg.wasm")),
      readFile(resolve(process.cwd(), "assets/fonts/NotoSans.ttf")),
    ]);
    const jb = createBrowserJustBrowser({
      assets: {
        coreWasm: new Uint8Array(coreWasm),
        rendererWasm: new Uint8Array(rendererWasm),
        fonts: new Map([["NotoSans.ttf", new Uint8Array(fontBytes)]]),
      },
    });
    instances.push(jb);

    const write = await jb.exec(`
      cat << 'EOF' > /index.html
      <!doctype html>
      <html>
        <head><title>Browser Runtime</title></head>
        <body><button id="b" onclick="this.textContent='Done'">Go</button></body>
      </html>
EOF
    `);
    expect(write.exitCode).toBe(0);
    const open = await jb.exec("agent-browser open /index.html");
    expect(open.exitCode).toBe(0);
    expect(open.stdout).toContain("Browser Runtime");
    const snap = await jb.exec("agent-browser snapshot -i");
    expect(snap.stdout).toContain('button "Go" [ref=e1]');
    await jb.exec("agent-browser click @e1");
    expect((await jb.exec('agent-browser get text "#b"')).stdout.trim()).toBe("Done");
  });

  it("injects into an existing Bash instance alongside custom tools (Node & browser)", async () => {
    const genPage = defineCommand("gen-page", async (args, ctx) => {
      const title = args[0] || "Generated";
      const html = `<!doctype html><html><head><title>${title}</title></head><body><button id="b" onclick="this.textContent='Triggered'">Invoke</button></body></html>`;
      await ctx.fs.writeFile("/tool-out.html", html);
      return { stdout: "/tool-out.html\n", stderr: "", exitCode: 0 };
    });

    // Inject onto an existing Node Bash instance alongside gen-page
    const existingBash = new Bash({ customCommands: [genPage] });
    const plugin = attachAgentBrowser(existingBash);
    instances.push(plugin);

    const res = await existingBash.exec(
      'page=$(gen-page "Plugin Host") && agent-browser open "$page" && agent-browser snapshot -i',
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Plugin Host");
    expect(res.stdout).toContain('button "Invoke" [ref=e1]');

    await existingBash.exec("agent-browser click @e1");
    expect((await existingBash.exec('agent-browser get text "#b"')).stdout.trim()).toBe("Triggered");

    // Pass createAgentBrowserPlugin().command into Bash constructor customCommands
    const ctorPlugin = createAgentBrowserPlugin({ defaultSessionName: "ctor-plugin" });
    instances.push(ctorPlugin);
    const bashWithCtorPlugin = new Bash({ customCommands: [genPage, ctorPlugin.command] });
    const ctorRes = await bashWithCtorPlugin.exec(
      'gen-page "Ctor" >/dev/null && agent-browser open /tool-out.html',
    );
    expect(ctorRes.exitCode).toBe(0);
    expect(ctorRes.stdout).toContain("Ctor");

    // Inject into an existing pure-browser Bash instance
    const [coreWasm, rendererWasm, fontBytes] = await Promise.all([
      readFile(resolve(process.cwd(), "assets/wasm/kitesurf_core_bg.wasm")),
      readFile(resolve(process.cwd(), "assets/wasm/renderer_core_bg.wasm")),
      readFile(resolve(process.cwd(), "assets/fonts/NotoSans.ttf")),
    ]);
    const browserBash = new BrowserBash({ customCommands: [genPage] });
    const browserPlugin = attachBrowserAgentBrowser(browserBash, {
      assets: {
        coreWasm: new Uint8Array(coreWasm),
        rendererWasm: new Uint8Array(rendererWasm),
        fonts: new Map([["NotoSans.ttf", new Uint8Array(fontBytes)]]),
      },
    });
    instances.push(browserPlugin);

    const browserRes = await browserBash.exec(
      'gen-page "Browser Plugin" >/dev/null && agent-browser open /tool-out.html && agent-browser snapshot -i',
    );
    expect(browserRes.exitCode).toBe(0);
    expect(browserRes.stdout).toContain("Browser Plugin");
    expect(browserRes.stdout).toContain('button "Invoke" [ref=e1]');
  });
});
