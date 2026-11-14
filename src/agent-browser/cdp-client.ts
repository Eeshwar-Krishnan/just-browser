/**
 * Multiplexed CDP client over an in-process Kitesurf CDP session.
 * Handles request IDs, multi-tab target/session switching, domain enablement,
 * and buffering console / page-exception logs for `agent-browser`.
 */

import type { Protocol } from "devtools-protocol";
import type { CdpEvent, CdpRequest } from "../../assets/kitesurf-bundles/engine-host.js";
import type { InProcessCdpSession } from "../kitesurf/session-host.ts";

export interface ConsoleLogEntry {
  type: string;
  text: string;
  timestamp: number;
}

export interface PageErrorEntry {
  message: string;
  timestamp: number;
}

export interface TabInfo {
  targetId: string;
  sessionId: string;
  url: string;
  title: string;
}

export class CdpClient {
  private readonly session: InProcessCdpSession;
  private nextId = 1;
  private tabs: TabInfo[] = [];
  private activeTabIndex = 0;
  private consoleLogs: ConsoleLogEntry[] = [];
  private pageErrors: PageErrorEntry[] = [];
  private readonly unsub: () => void;

  constructor(session: InProcessCdpSession) {
    this.session = session;
    this.unsub = session.onEvent((ev) => this.handleEvent(ev));
  }

  private handleEvent(ev: CdpEvent): void {
    if (ev.method === "Runtime.consoleAPICalled") {
      const p = ev.params as Protocol.Runtime.ConsoleAPICalledEvent | undefined;
      if (p) {
        const text = (p.args ?? [])
          .map((a) => (a.value !== undefined ? String(a.value) : (a.description ?? "")))
          .join(" ");
        this.consoleLogs.push({
          type: p.type ?? "log",
          text,
          timestamp: Date.now(),
        });
        if (this.consoleLogs.length > 500) this.consoleLogs.shift();
      }
    } else if (ev.method === "Runtime.exceptionThrown") {
      const p = ev.params as Protocol.Runtime.ExceptionThrownEvent | undefined;
      if (p?.exceptionDetails) {
        const d = p.exceptionDetails;
        const msg =
          d.exception?.description || d.exception?.value || d.text || "Uncaught exception";
        this.pageErrors.push({
          message: String(msg),
          timestamp: Date.now(),
        });
        if (this.pageErrors.length > 200) this.pageErrors.shift();
      }
    } else if (ev.method === "Page.frameNavigated") {
      const p = ev.params as { frame?: { url?: string; parentId?: string } } | undefined;
      if (p?.frame && !p.frame.parentId && p.frame.url) {
        const tab = this.tabs[this.activeTabIndex];
        if (tab) tab.url = p.frame.url;
      }
    }
  }

  async init(): Promise<void> {
    const initialTargetId = this.session.initialTargetId;
    const sessionId = await this.attachTarget(initialTargetId);
    this.tabs = [
      {
        targetId: initialTargetId,
        sessionId,
        url: "about:blank",
        title: "",
      },
    ];
    this.activeTabIndex = 0;
    await this.enableDomains(sessionId);
  }

  private async attachTarget(targetId: string): Promise<string> {
    const res = await this.sendRaw<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    return res.sessionId;
  }

  private async enableDomains(sessionId: string): Promise<void> {
    await this.send("Page.enable", undefined, sessionId);
    await this.send("DOM.enable", undefined, sessionId);
    await this.send("Accessibility.enable", undefined, sessionId);
    await this.send("Runtime.enable", undefined, sessionId);
    await this.send("Network.enable", undefined, sessionId);
  }

  get activeSessionId(): string {
    const tab = this.tabs[this.activeTabIndex];
    if (!tab) {
      throw new Error("No active browser tab");
    }
    return tab.sessionId;
  }

  get activeTargetId(): string {
    const tab = this.tabs[this.activeTabIndex];
    if (!tab) {
      throw new Error("No active browser tab");
    }
    return tab.targetId;
  }

  get activeTab(): TabInfo {
    const tab = this.tabs[this.activeTabIndex];
    if (!tab) throw new Error("No active browser tab");
    return tab;
  }

  get activeTabIdx(): number {
    return this.activeTabIndex;
  }

  listTabs(): TabInfo[] {
    return this.tabs.map((t) => ({ ...t }));
  }

  async newTab(url = "about:blank"): Promise<{ index: number; tab: TabInfo }> {
    const { targetId } = await this.sendRaw<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const sessionId = await this.attachTarget(targetId);
    await this.enableDomains(sessionId);
    const tab: TabInfo = { targetId, sessionId, url: "about:blank", title: "" };
    this.tabs.push(tab);
    this.activeTabIndex = this.tabs.length - 1;
    if (url && url !== "about:blank") {
      await this.send("Page.navigate", { url }, sessionId);
      tab.url = url;
    }
    return { index: this.activeTabIndex, tab: { ...tab } };
  }

  switchTab(index: number): TabInfo {
    if (index < 0 || index >= this.tabs.length) {
      throw new Error(`Invalid tab index ${index} (0..${this.tabs.length - 1})`);
    }
    this.activeTabIndex = index;
    return { ...this.tabs[index]! };
  }

  async closeTab(index?: number): Promise<void> {
    const idx = index ?? this.activeTabIndex;
    const tab = this.tabs[idx];
    if (!tab) throw new Error(`Invalid tab index ${idx}`);
    if (this.tabs.length === 1) {
      throw new Error("Cannot close the last remaining tab; use `close` to close the session.");
    }
    await this.sendRaw("Target.closeTarget", { targetId: tab.targetId });
    this.tabs.splice(idx, 1);
    if (this.activeTabIndex >= this.tabs.length) {
      this.activeTabIndex = this.tabs.length - 1;
    }
  }

  async sendRaw<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<T> {
    const res = await this.session.send({
      id: this.nextId++,
      method,
      params,
      sessionId,
    } as CdpRequest);
    if ("error" in res && res.error) {
      throw new Error(`${method} failed: ${res.error.message}`);
    }
    return ((res as { result?: unknown }).result ?? {}) as T;
  }

  send<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId: string = this.activeSessionId,
  ): Promise<T> {
    return this.sendRaw<T>(method, params, sessionId);
  }

  async evaluate<T = unknown>(expression: string, awaitPromise = true): Promise<T> {
    const res = await this.send<Protocol.Runtime.EvaluateResponse>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.exception?.value ||
        res.exceptionDetails.text ||
        "Evaluation error";
      throw new Error(String(desc));
    }
    return res.result?.value as T;
  }

  getConsole(clear = false): ConsoleLogEntry[] {
    const out = [...this.consoleLogs];
    if (clear) this.consoleLogs = [];
    return out;
  }

  getErrors(clear = false): PageErrorEntry[] {
    const out = [...this.pageErrors];
    if (clear) this.pageErrors = [];
    return out;
  }

  isClosed(): boolean {
    return this.session.isClosed();
  }

  async close(): Promise<void> {
    this.unsub();
    await this.session.close();
  }
}
