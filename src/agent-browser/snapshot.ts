/**
 * Accessibility tree snapshot builder over CDP.
 * Assigns durable `@e1`, `@e2`, ... refs in `RefMap` and formats trees identically
 * to `agent-browser`'s `snapshot` command (`-i`, `-c`, `-d`, `-s`, `-C`, `--urls`).
 */

import type { Protocol } from "devtools-protocol";
import type { CdpClient } from "./cdp-client.ts";
import { RefMap, RoleNameTracker } from "./ref-map.ts";

export interface SnapshotOptions {
  /** Only include interactive elements (`-i`). */
  interactive?: boolean;
  /** Compact mode: prune empty structural elements (`-c`). */
  compact?: boolean;
  /** Maximum tree depth (`-d N`). */
  maxDepth?: number;
  /** Restrict snapshot to elements under CSS selector (`-s SEL`). */
  selector?: string;
  /** Scan cursor-interactive elements not present in AX tree (`-C`). */
  cursor?: boolean;
  /** Include link href annotations (`--urls`). */
  urls?: boolean;
}

export interface SnapshotResult {
  tree: string;
  refs: Record<
    string,
    {
      role: string;
      name?: string;
      nth?: number;
      backendNodeId?: number;
      url?: string;
    }
  >;
  stats: {
    lines: number;
    chars: number;
    refs: number;
    interactive: number;
  };
}

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "treeitem",
]);

const CONTENT_ROLES = new Set([
  "heading",
  "cell",
  "gridcell",
  "columnheader",
  "rowheader",
  "listitem",
  "article",
  "region",
  "main",
  "navigation",
]);

const STRUCTURAL_ROLES = new Set([
  "generic",
  "group",
  "list",
  "table",
  "row",
  "rowgroup",
  "grid",
  "treegrid",
  "menu",
  "menubar",
  "toolbar",
  "tablist",
  "tree",
  "directory",
  "document",
  "application",
  "presentation",
  "none",
  "RootWebArea",
  "WebArea",
  "paragraph",
  "Section",
  "banner",
  "contentinfo",
  "complementary",
  "form",
  "search",
]);

function axPropValue(node: Protocol.Accessibility.AXNode, propName: string): unknown {
  return node.properties?.find((p) => p.name === propName)?.value?.value;
}

function normalizeRole(rawRole?: string): string {
  if (!rawRole) return "generic";
  if (rawRole === "RootWebArea" || rawRole === "WebArea") return "document";
  return rawRole;
}

function axString(v?: Protocol.Accessibility.AXValue): string {
  if (!v || v.value === undefined || v.value === null) return "";
  return String(v.value);
}

interface TreeNode {
  axNode: Protocol.Accessibility.AXNode;
  children: TreeNode[];
}

function buildAxHierarchy(
  axNodes: Protocol.Accessibility.AXNode[],
  scopeBackendNodeId?: number,
): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const axNode of axNodes) {
    byId.set(axNode.nodeId, { axNode, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const axNode of axNodes) {
    const current = byId.get(axNode.nodeId)!;
    if (axNode.parentId && byId.has(axNode.parentId)) {
      byId.get(axNode.parentId)!.children.push(current);
    } else if (axNode.childIds) {
      roots.push(current);
    }
  }

  // Fallback linkage via childIds when parentId is absent
  const parented = new Set<string>();
  for (const n of byId.values()) {
    for (const c of n.children) parented.add(c.axNode.nodeId);
  }
  for (const axNode of axNodes) {
    const parent = byId.get(axNode.nodeId)!;
    for (const cid of axNode.childIds ?? []) {
      const child = byId.get(cid);
      if (child && !parented.has(cid) && child !== parent) {
        parent.children.push(child);
        parented.add(cid);
      }
    }
  }

  const topRoots = Array.from(byId.values()).filter((n) => !parented.has(n.axNode.nodeId));
  const finalRoots = topRoots.length > 0 ? topRoots : roots;

  if (scopeBackendNodeId !== undefined) {
    const found = findSubtreeByBackendId(finalRoots, scopeBackendNodeId);
    return found ? [found] : [];
  }
  return finalRoots;
}

function findSubtreeByBackendId(nodes: TreeNode[], targetBackendId: number): TreeNode | null {
  for (const n of nodes) {
    if (n.axNode.backendDOMNodeId === targetBackendId) return n;
    const hit = findSubtreeByBackendId(n.children, targetBackendId);
    if (hit) return hit;
  }
  return null;
}

async function resolveScopeBackendId(
  client: CdpClient,
  selector: string,
): Promise<number | undefined> {
  const evalRes = await client.send<Protocol.Runtime.EvaluateResponse>("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
    returnByValue: false,
  });
  const objectId = evalRes.result?.objectId;
  if (!objectId) {
    throw new Error(`Snapshot selector not found: ${selector}`);
  }
  try {
    const desc = await client.send<{ node: Protocol.DOM.Node }>("DOM.describeNode", {
      objectId,
    });
    return desc.node.backendNodeId;
  } finally {
    await client.send("Runtime.releaseObject", { objectId }).catch(() => {});
  }
}

async function scanCursorElements(client: CdpClient): Promise<
  Array<{
    role: string;
    name: string;
    selector: string;
    cursor: boolean;
    onclick: boolean;
    tabindex: boolean;
  }>
> {
  const res = await client.evaluate<
    Array<{
      role: string;
      name: string;
      selector: string;
      cursor: boolean;
      onclick: boolean;
      tabindex: boolean;
    }>
  >(`(() => {
    const std = new Set(["A","BUTTON","INPUT","SELECT","TEXTAREA","DETAILS","SUMMARY"]);
    const out = [];
    const all = document.querySelectorAll("*");
    let idx = 0;
    for (const el of all) {
      if (std.has(el.tagName)) continue;
      const role = el.getAttribute("role");
      if (role && ["button","link","textbox","checkbox","radio","combobox","menuitem","tab"].includes(role)) continue;
      const style = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      const hasCursor = style ? style.cursor === "pointer" : false;
      const hasOnClick = el.hasAttribute("onclick");
      const tabIdx = el.getAttribute("tabindex");
      const hasTab = tabIdx !== null && tabIdx !== "-1";
      if (!hasCursor && !hasOnClick && !hasTab) continue;
      const text = (el.textContent || "").trim().slice(0, 80);
      if (!text) continue;
      idx++;
      const sel = el.id ? "#" + CSS.escape(el.id) : "[data-kb-idx='" + idx + "']";
      if (!el.id) el.setAttribute("data-kb-idx", String(idx));
      out.push({
        role: hasOnClick || hasCursor ? "clickable" : "focusable",
        name: text,
        selector: sel,
        cursor: hasCursor,
        onclick: hasOnClick,
        tabindex: hasTab,
      });
    }
    return out;
  })()`);
  return Array.isArray(res) ? res : [];
}

export async function takeSnapshot(
  client: CdpClient,
  refMap: RefMap,
  options: SnapshotOptions = {},
): Promise<SnapshotResult> {
  refMap.clear();
  await client.send("DOM.enable");
  await client.send("Accessibility.enable");

  let scopeBackendNodeId: number | undefined;
  if (options.selector) {
    scopeBackendNodeId = await resolveScopeBackendId(client, options.selector);
  }

  const axRes = await client.send<Protocol.Accessibility.GetFullAXTreeResponse>(
    "Accessibility.getFullAXTree",
    {},
  );
  const roots = buildAxHierarchy(axRes.nodes ?? [], scopeBackendNodeId);

  const tracker = new RoleNameTracker();
  const lines: string[] = [];
  const rawNodes: Array<{
    indent: number;
    role: string;
    name: string;
    ref?: string;
    key: string;
    nth?: number;
    attrs: string[];
  }> = [];

  function visit(node: TreeNode, depth: number): void {
    if (options.maxDepth !== undefined && depth > options.maxDepth) return;
    const ax = node.axNode;
    if (ax.ignored) {
      for (const child of node.children) visit(child, depth);
      return;
    }

    const role = normalizeRole(axString(ax.role));
    const lowerRole = role.toLowerCase();
    const name = axString(ax.name).trim();
    const value = axString(ax.value).trim();

    if (lowerRole === "statictext" || lowerRole === "inlinetextbox") {
      // Skip redundant inline text nodes when not interactive-only; parent carries accessible name
      if (!options.interactive && name && !options.compact) {
        const indent = "  ".repeat(depth);
        lines.push(`${indent}- text ${JSON.stringify(name)}`);
      }
      return;
    }

    const isInteractive = INTERACTIVE_ROLES.has(lowerRole);
    const isContent = CONTENT_ROLES.has(lowerRole);
    const isStructural = STRUCTURAL_ROLES.has(role) || STRUCTURAL_ROLES.has(lowerRole);

    if (options.interactive && !isInteractive) {
      for (const child of node.children) visit(child, depth);
      return;
    }

    const shouldAssignRef = isInteractive || (isContent && name.length > 0);
    let assignedRef: string | undefined;
    let nth: number | undefined;
    const urlVal = axPropValue(ax, "url");
    const urlStr = typeof urlVal === "string" && urlVal ? urlVal : undefined;

    if (shouldAssignRef) {
      assignedRef = refMap.nextRef();
      nth = tracker.trackRef(lowerRole, name || undefined, assignedRef);
      refMap.add(assignedRef, {
        role: lowerRole,
        name: name || undefined,
        backendNodeId: ax.backendDOMNodeId,
        nth,
        url: urlStr,
      });
    }

    const includeLine =
      assignedRef !== undefined ||
      (!options.interactive && (!options.compact || !isStructural || name.length > 0));

    if (includeLine && !(role === "document" && depth === 0 && options.interactive)) {
      const attrs: string[] = [];
      const level = axPropValue(ax, "level");
      if (typeof level === "number") attrs.push(`[level=${level}]`);
      const checked = axPropValue(ax, "checked");
      if (checked === true || checked === "true") attrs.push("[checked]");
      const disabled = axPropValue(ax, "disabled");
      if (disabled === true) attrs.push("[disabled]");
      if (options.urls && urlStr) attrs.push(`[url=${JSON.stringify(urlStr)}]`);

      rawNodes.push({
        indent: options.interactive ? 0 : depth,
        role: lowerRole,
        name,
        ref: assignedRef,
        key: `${lowerRole}\0${name}`,
        nth,
        attrs,
      });
    }

    for (const child of node.children) {
      visit(child, options.interactive ? depth : depth + 1);
    }
  }

  for (const r of roots) {
    visit(r, 0);
  }

  if (options.cursor) {
    const cursorEls = await scanCursorElements(client);
    for (const el of cursorEls) {
      const ref = refMap.nextRef();
      const nth = tracker.trackRef(el.role, el.name, ref);
      refMap.add(ref, {
        role: el.role,
        name: el.name,
        selector: el.selector,
        nth,
      });
      rawNodes.push({
        indent: 0,
        role: el.role,
        name: el.name,
        ref,
        key: `${el.role}\0${el.name}`,
        nth,
        attrs: [
          el.cursor ? "[cursor:pointer]" : el.onclick ? "[onclick]" : "[tabindex]",
        ],
      });
    }
  }

  const dups = tracker.getDuplicateKeys();
  lines.length = 0;
  for (const item of rawNodes) {
    const indent = "  ".repeat(item.indent);
    const namePart = item.name ? ` ${JSON.stringify(item.name)}` : "";
    const nthPart =
      item.ref && item.nth !== undefined && item.nth > 0 && dups.has(item.key)
        ? ` [nth=${item.nth}]`
        : "";
    const refPart = item.ref ? ` [ref=${item.ref}]` : "";
    const attrsPart = item.attrs.length > 0 ? ` ${item.attrs.join(" ")}` : "";
    lines.push(`${indent}- ${item.role}${namePart}${refPart}${nthPart}${attrsPart}`);
  }

  // Prune nth from RefMap when role+name is unique
  for (const entry of refMap.entries()) {
    const key = `${entry.role}\0${entry.name ?? ""}`;
    if (!dups.has(key)) {
      delete entry.nth;
    }
  }

  const tree = lines.length > 0 ? lines.join("\n") : "(empty page)";
  const refsRecord: SnapshotResult["refs"] = {};
  let interactiveCount = 0;
  for (const e of refMap.entries()) {
    if (INTERACTIVE_ROLES.has(e.role) || e.role === "clickable" || e.role === "focusable") {
      interactiveCount += 1;
    }
    refsRecord[e.ref] = {
      role: e.role,
      ...(e.name !== undefined ? { name: e.name } : {}),
      ...(e.nth !== undefined ? { nth: e.nth } : {}),
      ...(e.backendNodeId !== undefined ? { backendNodeId: e.backendNodeId } : {}),
      ...(e.url !== undefined ? { url: e.url } : {}),
    };
  }

  return {
    tree,
    refs: refsRecord,
    stats: {
      lines: lines.length,
      chars: tree.length,
      refs: refMap.size(),
      interactive: interactiveCount,
    },
  };
}
