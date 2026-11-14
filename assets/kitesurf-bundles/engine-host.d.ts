export interface CdpRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface CdpResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  sessionId?: string;
}

export interface CdpEvent {
  method: string;
  params?: unknown;
  sessionId?: string;
}

export type ExternalOutbound =
  | { fetch(request: Request): Promise<Response> }
  | ((request: Request) => Promise<Response>);

export type SandboxOutboundExports = Record<string, unknown>;

export interface PageTargetState {
  targetId: string;
  type: string;
  pendingNavAbort?: AbortController | null;
  navigateGeneration: number;
  pageScriptLease?: unknown;
}

export interface BrowserState {
  targets: Map<string, PageTargetState>;
  sandboxOutbound: unknown;
  contexts: Map<string, unknown>;
  nextBrowserContextId: number;
  autoAttach: boolean;
  flatten: boolean;
  cookies: unknown;
  screencasts: Map<string, { stopped: boolean }>;
  styleCache: unknown;
  imageCache: Map<string, unknown>;
  networkEvents: unknown;
  layoutMode: "full" | "off";
  cdpDebug: boolean;
  isolateCapOverrides: Record<string, unknown>;
  connectionMode: "browser" | "page";
  ttyKeyboard: boolean;
  preNavScripts: Map<string, string>;
  learnedInsertedScripts: Map<string, unknown>;
  pendingBindings: Set<string>;
  execContextSeq: number;
  runtimeEnabledSessions: Set<string>;
  rendererManager: { close(reason?: string): void } | null;
  workerBudget: { countPageTargets: () => number };
  dedicatedWorkers: { terminateAll(reason?: string): void };
  skipSpeculativeRaster: boolean;
  skipPartialRaster: boolean;
  fontDefer: boolean;
  rendererSessionId: string | null;
  engineSessionId: string | null;
  wsClosing: boolean;
  attributionHeaders: Record<string, string>;
}

export interface DispatchCtx {
  browser: BrowserState;
  emit: (event: CdpEvent) => void;
  commandExtension: unknown;
  requestBlocker: unknown;
  env: Record<string, unknown>;
  ctx: unknown;
  connectionId: string;
  analytics: unknown;
}

export declare function dispatch(ctx: DispatchCtx, req: CdpRequest): Promise<CdpResponse>;
export declare function ensureBrowserTarget(ctx: DispatchCtx): unknown;
export declare function createPageTarget(ctx: DispatchCtx, url: string): PageTargetState;
export declare function pumpBackgroundEvents(ctx: DispatchCtx, target: PageTargetState): void;
export declare function teardownOopifStubs(
  target: PageTargetState,
  reason: string,
  extra: unknown,
  opts: { budget: unknown; waitUntil: (p: Promise<unknown>) => void },
): void;
export declare function retireStub(
  target: PageTargetState,
  kind: string,
  reason: string,
  opts: { budget: unknown; waitUntil: (p: Promise<unknown>) => void },
): unknown;
export declare function releaseAllDomHandles(target: PageTargetState): void;
export declare function cancelAndRemoveTargetWheelQueues(browser: BrowserState, targetId: string): unknown;
export declare function stopSceneStreams(browser: BrowserState): void;
export declare class DynamicWorkerBudget {
  countPageTargets: () => number;
}
export declare class DedicatedWorkers {
  constructor(budget: DynamicWorkerBudget, waitUntil: (p: Promise<unknown>) => void);
  terminateAll(reason?: string): void;
}
export declare function createCookieJar(): unknown;
export declare class NetworkEventTracker {
  constructor(emit: (event: CdpEvent) => void, connectionId: string);
  drain(): void;
  dispose(): void;
}
export declare function registerTracker(connectionId: string, tracker: NetworkEventTracker): void;
export declare function unregisterTracker(connectionId: string): void;
export declare function registerCookieJar(connectionId: string, jar: unknown): void;
export declare function unregisterConnectionCookieJars(connectionId: string, contexts: Iterable<string>): void;
export declare function disposeWebMcpConnection(connectionId: string): void;
export declare function dropConnectionImages(connectionId: string): void;
export declare function unregisterIsolateLimitListenersFor(connectionId: string): void;
export declare class SandboxOutbound {
  constructor(ctx: unknown, env: unknown);
  fetch(req: Request): Promise<Response>;
}
export declare class DeniedOutbound {
  constructor(ctx: unknown, env: unknown);
  fetch(req: Request): Promise<Response>;
}
export declare class PageScriptTail {
  constructor(ctx: unknown, env: unknown);
}
export declare class SpanSink {
  constructor(ctx: unknown, env: unknown);
}
export declare function createSandboxOutboundOverride(
  exportsMap: SandboxOutboundExports,
  env: unknown,
  externalOutbound?: ExternalOutbound,
  filter?: unknown,
): unknown;
export declare function unregisterOutboundFilters(connectionId: string): void;
export declare function unregisterRequestBlocker(connectionId: string): void;
export declare function unregisterInterception(connectionId: string): void;
export declare function drainInterception(connectionId: string): void;
export declare class SafePerformance {
  constructor(perf?: Performance);
}
export declare class KitesurfAnalytics {
  constructor(meta: Record<string, unknown>, perf: SafePerformance, extra: Record<string, unknown>);
}
export declare function buildDispatchEnv(env: Record<string, unknown>): Record<string, unknown>;
export declare function markArrival(req: CdpRequest, now: number): void;
export declare class StyleCache {}
export declare function makeWallClock(env: Record<string, unknown>): () => number;
