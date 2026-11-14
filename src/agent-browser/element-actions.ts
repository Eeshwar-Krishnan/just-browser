/**
 * Element resolution and DOM/Input interactions over Kitesurf CDP.
 * Supports `@e1` accessibility refs, CSS selectors, and `text=` / `role=` locators.
 */

import type { Protocol } from "devtools-protocol";
import type { CdpClient } from "./cdp-client.ts";
import { parseRef, type RefMap } from "./ref-map.ts";

export interface ResolvedElement {
  objectId: string;
  backendNodeId?: number;
  release(): Promise<void>;
}

async function evalObjectId(client: CdpClient, expression: string): Promise<string | null> {
  const res = await client.send<Protocol.Runtime.EvaluateResponse>("Runtime.evaluate", {
    expression,
    returnByValue: false,
    awaitPromise: false,
  });
  if (res.exceptionDetails) {
    throw new Error(
      res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        "Element query failed",
    );
  }
  return res.result?.objectId ?? null;
}

function makeLocatorExpression(target: string): string {
  if (target.startsWith("text=")) {
    const query = target.slice("text=".length);
    return `(() => {
      const q = ${JSON.stringify(query)};
      for (const el of document.querySelectorAll("button,a,input,label,[role],h1,h2,h3,h4,p,span,div,li")) {
        if ((el.textContent || "").trim() === q) return el;
      }
      for (const el of document.querySelectorAll("*")) {
        if ((el.textContent || "").includes(q) && el.children.length === 0) return el;
      }
      return null;
    })()`;
  }
  if (target.startsWith("css=")) {
    return `document.querySelector(${JSON.stringify(target.slice(4))})`;
  }
  return `document.querySelector(${JSON.stringify(target)})`;
}

export async function resolveTargetElement(
  client: CdpClient,
  refMap: RefMap,
  target: string,
): Promise<ResolvedElement> {
  const normalizedRef = parseRef(target);
  if (normalizedRef) {
    const entry = refMap.get(normalizedRef);
    if (!entry) {
      throw new Error(`Unknown ref "${target}". Run \`snapshot\` first to inspect available refs.`);
    }
    if (entry.backendNodeId !== undefined) {
      const resolved = await client.send<Protocol.DOM.ResolveNodeResponse>("DOM.resolveNode", {
        backendNodeId: entry.backendNodeId,
      });
      if (resolved.object?.objectId) {
        const objectId = resolved.object.objectId;
        return {
          objectId,
          backendNodeId: entry.backendNodeId,
          release: () => client.send("Runtime.releaseObject", { objectId }).then(() => {}).catch(() => {}),
        };
      }
    }
    if (entry.selector) {
      const objectId = await evalObjectId(client, makeLocatorExpression(entry.selector));
      if (objectId) {
        return {
          objectId,
          release: () => client.send("Runtime.releaseObject", { objectId }).then(() => {}).catch(() => {}),
        };
      }
    }
    throw new Error(`Ref "${target}" (${entry.role} ${entry.name ?? ""}) is no longer attached.`);
  }

  const objectId = await evalObjectId(client, makeLocatorExpression(target));
  if (!objectId) {
    throw new Error(`Element not found for selector: ${target}`);
  }
  return {
    objectId,
    release: () => client.send("Runtime.releaseObject", { objectId }).then(() => {}).catch(() => {}),
  };
}

export async function callOnElement<T = unknown>(
  client: CdpClient,
  el: ResolvedElement,
  functionDeclaration: string,
  args: unknown[] = [],
): Promise<T> {
  const res = await client.send<Protocol.Runtime.CallFunctionOnResponse>("Runtime.callFunctionOn", {
    objectId: el.objectId,
    functionDeclaration,
    arguments: args.map((value) => ({ value })),
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(
      res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        "callFunctionOn failed",
    );
  }
  return res.result?.value as T;
}

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function getElementBox(client: CdpClient, el: ResolvedElement): Promise<ElementBox> {
  if (el.backendNodeId !== undefined) {
    try {
      const quads = await client.send<{ quads?: number[][] }>("DOM.getContentQuads", {
        backendNodeId: el.backendNodeId,
      });
      const q = quads.quads?.[0];
      if (q && q.length >= 8) {
        const xs = [q[0]!, q[2]!, q[4]!, q[6]!];
        const ys = [q[1]!, q[3]!, q[5]!, q[7]!];
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }
    } catch {
      // Fall through to JS rect
    }
  }
  const rect = await callOnElement<ElementBox>(
    client,
    el,
    `function() {
      const r = this.getBoundingClientRect ? this.getBoundingClientRect() : null;
      return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : { x: 0, y: 0, width: 0, height: 0 };
    }`,
  );
  return rect ?? { x: 0, y: 0, width: 0, height: 0 };
}

async function dispatchMouseClick(
  client: CdpClient,
  x: number,
  y: number,
  clickCount = 1,
): Promise<void> {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
  });
  for (let c = 1; c <= clickCount; c++) {
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: c,
      buttons: 1,
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: c,
      buttons: 0,
    });
  }
}

export async function clickElement(
  client: CdpClient,
  refMap: RefMap,
  target: string,
  clickCount = 1,
): Promise<void> {
  const el = await resolveTargetElement(client, refMap, target);
  try {
    await callOnElement(
      client,
      el,
      "function() { if (typeof this.scrollIntoView === 'function') this.scrollIntoView({ block: 'center', inline: 'center' }); }",
    ).catch(() => {});
    const box = await getElementBox(client, el);
    if (box.width > 0 && box.height > 0) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await dispatchMouseClick(client, cx, cy, clickCount);
      return;
    }
    // Zero-box fallback for non-visual/inline nodes
    await callOnElement(
      client,
      el,
      `function(cnt) {
        if (typeof this.focus === "function") this.focus();
        if (cnt >= 2 && typeof MouseEvent === "function") {
          this.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
        } else if (typeof this.click === "function") {
          this.click();
        }
      }`,
      [clickCount],
    );
  } finally {
    await el.release();
  }
}

export async function hoverElement(
  client: CdpClient,
  refMap: RefMap,
  target: string,
): Promise<void> {
  const el = await resolveTargetElement(client, refMap, target);
  try {
    const box = await getElementBox(client, el);
    const cx = box.width > 0 ? box.x + box.width / 2 : 0;
    const cy = box.height > 0 ? box.y + box.height / 2 : 0;
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: cx,
      y: cy,
      button: "none",
    });
    await callOnElement(
      client,
      el,
      `function() {
        if (typeof MouseEvent === "function") {
          this.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          this.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
        }
      }`,
    );
  } finally {
    await el.release();
  }
}

export async function focusElement(
  client: CdpClient,
  refMap: RefMap,
  target: string,
): Promise<void> {
  const el = await resolveTargetElement(client, refMap, target);
  try {
    if (el.backendNodeId !== undefined) {
      await client.send("DOM.focus", { backendNodeId: el.backendNodeId }).catch(() => {});
    }
    await callOnElement(client, el, "function() { if (typeof this.focus === 'function') this.focus(); }");
  } finally {
    await el.release();
  }
}

export async function fillElement(
  client: CdpClient,
  refMap: RefMap,
  target: string,
  text: string,
  clearFirst: boolean,
): Promise<void> {
  const el = await resolveTargetElement(client, refMap, target);
  try {
    if (el.backendNodeId !== undefined) {
      await client.send("DOM.focus", { backendNodeId: el.backendNodeId }).catch(() => {});
    }
    await callOnElement(
      client,
      el,
      `function(val, shouldClear) {
        if (typeof this.focus === "function") this.focus();
        const next = shouldClear ? val : String(this.value ?? "") + val;
        if ("value" in this) {
          this.value = next;
        } else {
          this.textContent = next;
        }
        if (typeof Event === "function") {
          this.dispatchEvent(new Event("input", { bubbles: true }));
          this.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }`,
      [text, clearFirst],
    );
  } finally {
    await el.release();
  }
}

export async function pressKey(client: CdpClient, key: string): Promise<void> {
  const keyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : specialKeyCode(key);
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

function specialKeyCode(key: string): number {
  switch (key) {
    case "Enter":
      return 13;
    case "Tab":
      return 9;
    case "Backspace":
      return 8;
    case "Escape":
      return 27;
    case "ArrowLeft":
      return 37;
    case "ArrowUp":
      return 38;
    case "ArrowRight":
      return 39;
    case "ArrowDown":
      return 40;
    case "Space":
    case " ":
      return 32;
    default:
      return 0;
  }
}

export async function selectOption(
  client: CdpClient,
  refMap: RefMap,
  target: string,
  values: string[],
): Promise<string[]> {
  const el = await resolveTargetElement(client, refMap, target);
  try {
    return await callOnElement<string[]>(
      client,
      el,
      `function(vals) {
        const selected = [];
        const set = new Set(vals);
        if (this.options) {
          for (const opt of this.options) {
            const match = set.has(opt.value) || set.has((opt.textContent || "").trim());
            opt.selected = match;
            if (match) selected.push(opt.value);
          }
          if (selected.length > 0 && !this.multiple) this.value = selected[0];
        }
        if (typeof Event === "function") {
          this.dispatchEvent(new Event("input", { bubbles: true }));
          this.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return selected;
      }`,
      [values],
    );
  } finally {
    await el.release();
  }
}

export async function setChecked(
  client: CdpClient,
  refMap: RefMap,
  target: string,
  checked: boolean,
): Promise<boolean> {
  const el = await resolveTargetElement(client, refMap, target);
  try {
    return await callOnElement<boolean>(
      client,
      el,
      `function(desired) {
        if (Boolean(this.checked) !== desired) {
          this.checked = desired;
          if (typeof Event === "function") {
            this.dispatchEvent(new Event("input", { bubbles: true }));
            this.dispatchEvent(new Event("change", { bubbles: true }));
          }
          if (typeof MouseEvent === "function") {
            this.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          }
        }
        return Boolean(this.checked);
      }`,
      [checked],
    );
  } finally {
    await el.release();
  }
}
