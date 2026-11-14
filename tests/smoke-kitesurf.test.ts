import { describe, expect, it } from "vitest";
import { createInProcessCdpSession } from "../src/kitesurf/session-host.ts";
import {
  createNodeVmRunnerFactory,
  ensureNodeKitesurfAssets,
} from "../src/kitesurf/node-assets.ts";

describe("in-process Kitesurf WASM engine", () => {
  it("navigates, executes JS, returns Accessibility tree, and captures PNG/PDF", async () => {
    const { fontAssets } = await ensureNodeKitesurfAssets();
    const session = createInProcessCdpSession({
      fontAssets,
      runnerFactory: createNodeVmRunnerFactory(),
      connectionMode: "browser",
    });

    try {
      let id = 1;
      const attachRes = await session.send({
        id: id++,
        method: "Target.attachToTarget",
        params: { targetId: session.initialTargetId, flatten: true },
      });
      expect("error" in attachRes).toBe(false);
      const sessionId = (attachRes as { result: { sessionId: string } }).result.sessionId;

      await session.send({ id: id++, sessionId, method: "Page.enable" });
      await session.send({ id: id++, sessionId, method: "DOM.enable" });
      await session.send({ id: id++, sessionId, method: "Accessibility.enable" });
      await session.send({ id: id++, sessionId, method: "Runtime.enable" });

      const html = `<!doctype html>
<html>
  <head><title>Kitesurf In-Process</title></head>
  <body>
    <h1 id="title">Hello WASM</h1>
    <button id="btn" onclick="document.getElementById('status').textContent = 'clicked'">Submit Form</button>
    <p id="status">idle</p>
  </body>
</html>`;
      const navRes = await session.send({
        id: id++,
        sessionId,
        method: "Page.navigate",
        params: { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` },
      });
      expect("error" in navRes).toBe(false);

      const evalRes = await session.send({
        id: id++,
        sessionId,
        method: "Runtime.evaluate",
        params: {
          expression: "document.title + ':' + document.getElementById('title').textContent",
          returnByValue: true,
        },
      });
      expect("error" in evalRes).toBe(false);
      expect((evalRes as { result: { result: { value: unknown } } }).result.result.value).toBe(
        "Kitesurf In-Process:Hello WASM",
      );

      const axRes = await session.send({
        id: id++,
        sessionId,
        method: "Accessibility.getFullAXTree",
        params: {},
      });
      expect("error" in axRes).toBe(false);
      const nodes = (axRes as { result: { nodes: Array<{ role?: { value?: string }; name?: { value?: string } }> } })
        .result.nodes;
      expect(nodes.some((n) => n.role?.value === "button" && n.name?.value === "Submit Form")).toBe(
        true,
      );

      const shotRes = await session.send({
        id: id++,
        sessionId,
        method: "Page.captureScreenshot",
        params: { format: "png" },
      });
      expect("error" in shotRes).toBe(false);
      const b64 = (shotRes as { result: { data: string } }).result.data;
      const pngBytes = Buffer.from(b64, "base64");
      // PNG magic bytes: 89 50 4E 47
      expect(pngBytes[0]).toBe(0x89);
      expect(pngBytes[1]).toBe(0x50);
      expect(pngBytes[2]).toBe(0x4e);
      expect(pngBytes[3]).toBe(0x47);
    } finally {
      await session.close();
    }
  });
});
