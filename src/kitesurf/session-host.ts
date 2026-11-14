/**
 * In-memory Kitesurf CDP session host.
 * Directly drives Kitesurf's `dispatch()`, `BrowserState`, `PageScript`, and `PageRenderer`
 * without a WebSocket server or `wrangler`/`workerd` daemon.
 */

import { nanoid } from "nanoid";
import { installBase64Polyfill } from "./shims/base64-polyfill.ts";
import { type FontAssetsFetcher } from "./font-assets.ts";
import { KITESURF_CJS_BUNDLES } from "../../assets/kitesurf-bundles/cjs-bundles.js";
import { createInProcessWorkerLoader, type ScriptRunnerFactory } from "./in-process-loader.ts";
import {
  dispatch,
  type DispatchCtx,
  type BrowserState,
  type CdpEvent,
  type CdpRequest,
  type CdpResponse,
  ensureBrowserTarget,
  createPageTarget,
  pumpBackgroundEvents,
  teardownOopifStubs,
  retireStub,
  releaseAllDomHandles,
  cancelAndRemoveTargetWheelQueues,
  stopSceneStreams,
  DynamicWorkerBudget,
  DedicatedWorkers,
  createCookieJar,
  NetworkEventTracker,
  registerTracker,
  unregisterTracker,
  registerCookieJar,
  unregisterConnectionCookieJars,
  disposeWebMcpConnection,
  dropConnectionImages,
  unregisterIsolateLimitListenersFor,
  type ExternalOutbound,
  SandboxOutbound,
  createSandboxOutboundOverride,
  type SandboxOutboundExports,
  DeniedOutbound,
  PageScriptTail,
  SpanSink,
  unregisterOutboundFilters,
  unregisterRequestBlocker,
  unregisterInterception,
  drainInterception,
  KitesurfAnalytics,
  SafePerformance,
  buildDispatchEnv,
  markArrival,
  StyleCache,
  makeWallClock,
} from "../../assets/kitesurf-bundles/engine-host.js";

installBase64Polyfill(Uint8Array);

export interface CreateKitesurfSessionOptions {
  /** Font asset fetcher serving `/fonts/*`. */
  fontAssets: FontAssetsFetcher;
  /** Optional custom script runner (e.g., `createNodeVmRunnerFactory()` in Node). */
  runnerFactory?: ScriptRunnerFactory;
  /** Custom outbound HTTP handler (e.g., wrapping `just-bash`'s `SecureFetch`). */
  externalOutbound?: ExternalOutbound;
  /** Connection mode (`"browser"` creates explicit targets; `"page"` attaches first target immediately). */
  connectionMode?: "browser" | "page";
  /** Allow private/loopback network requests (useful in tests & local dev). Default: true when custom outbound is supplied. */
  allowPrivateNetwork?: boolean;
  /** Initial layout mode ("full" | "off"). Default: "full". */
  layoutMode?: "full" | "off";
  /** Enable verbose CDP debugging inside Kitesurf. */
  cdpDebug?: boolean;
}

export interface InProcessCdpSession {
  readonly connectionId: string;
  readonly initialTargetId: string;
  readonly browserState: BrowserState;
  send(req: CdpRequest): Promise<CdpResponse>;
  onEvent(listener: (ev: CdpEvent) => void): () => void;
  close(): Promise<void>;
  isClosed(): boolean;
}

export function createInProcessCdpSession(
  options: CreateKitesurfSessionOptions,
): InProcessCdpSession {
  const connectionId = nanoid(10);
  const listeners = new Set<(ev: CdpEvent) => void>();
  let closed = false;

  const loader = createInProcessWorkerLoader({
    cjsBundles: KITESURF_CJS_BUNDLES,
    runnerFactory: options.runnerFactory,
  });

  const env: Env = {
    LOADER: loader,
    FONT_ASSETS: options.fontAssets,
    KITESURF_ALLOW_PRIVATE_NETWORK:
      options.allowPrivateNetwork !== false ? "1" : undefined,
    KITESURF_SIMULATE_PROD_EVAL: undefined,
  };

  const backgroundPromises = new Set<Promise<unknown>>();
  const trackBg = (p: Promise<unknown>) => {
    backgroundPromises.add(p);
    void p.finally(() => backgroundPromises.delete(p)).catch(() => {});
  };

  const exportsMap = {
    SandboxOutbound: ({ props }: { props: Record<string, unknown> }) => {
      const ep = new SandboxOutbound({ props, waitUntil: trackBg } as never, env as never);
      return { fetch: (req: Request) => ep.fetch(req) };
    },
    DeniedOutbound: ({ props }: { props?: Record<string, unknown> }) => {
      const ep = new DeniedOutbound({ props: props ?? {}, waitUntil: trackBg } as never, env as never);
      return { fetch: (req: Request) => ep.fetch(req) };
    },
    PageScriptTail: ({ props }: { props: Record<string, unknown> }) => {
      const ep = new PageScriptTail({ props, waitUntil: trackBg } as never, env as never);
      return ep;
    },
    SpanSink: ({ props }: { props: Record<string, unknown> }) => {
      const ep = new SpanSink({ props, waitUntil: trackBg } as never, env as never);
      return ep;
    },
  };

  const ctx = {
    waitUntil: trackBg,
    passThroughOnException: () => {},
    props: {},
    exports: exportsMap,
  } as unknown as ExecutionContext;

  const emit = (event: CdpEvent) => {
    if (closed) return;
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        // Ignore listener errors so engine flow stays intact.
      }
    }
  };

  const networkEvents = new NetworkEventTracker(emit, connectionId);
  registerTracker(connectionId, networkEvents);

  const cookies = createCookieJar();
  registerCookieJar(connectionId, cookies);

  const workerBudget = new DynamicWorkerBudget();
  const analytics = new KitesurfAnalytics(
    {
      sessionId: connectionId,
      entrypoint: "just-browser",
      connectionMode: options.connectionMode ?? "browser",
      environment: "in-process",
      buildVersion: "0.1.0",
      colo: "local",
    },
    new SafePerformance(undefined),
    {
      factory: undefined,
      request: new Request("https://just-browser.local/cdp"),
      props: {},
      env,
      waitUntil: trackBg,
    },
  );

  const browser: BrowserState = {
    targets: new Map(),
    sandboxOutbound: createSandboxOutboundOverride(
      exportsMap as unknown as SandboxOutboundExports,
      env as never,
      options.externalOutbound,
      undefined,
    ),
    contexts: new Map(),
    nextBrowserContextId: 1,
    autoAttach: false,
    flatten: false,
    cookies,
    screencasts: new Map(),
    styleCache: new StyleCache(),
    imageCache: new Map(),
    networkEvents,
    layoutMode: options.layoutMode ?? "full",
    cdpDebug: options.cdpDebug ?? false,
    isolateCapOverrides: {},
    connectionMode: options.connectionMode ?? "browser",
    ttyKeyboard: false,
    preNavScripts: new Map<string, string>(),
    learnedInsertedScripts: new Map(),
    pendingBindings: new Set<string>(),
    execContextSeq: 3,
    runtimeEnabledSessions: new Set<string>(),
    rendererManager: null,
    workerBudget,
    dedicatedWorkers: new DedicatedWorkers(workerBudget, trackBg),
    skipSpeculativeRaster: false,
    skipPartialRaster: false,
    fontDefer: false,
    rendererSessionId: null,
    engineSessionId: null,
    wsClosing: false,
    attributionHeaders: {},
  };

  browser.workerBudget.countPageTargets = () => {
    let n = 0;
    for (const t of browser.targets.values()) {
      if (t.type !== "page") continue;
      if (t.pageScriptLease || t.navigateGeneration > 0) n += 1;
    }
    return n;
  };

  const dispatchCtx: DispatchCtx = {
    browser,
    emit,
    commandExtension: undefined,
    requestBlocker: undefined,
    env: buildDispatchEnv(env),
    ctx,
    connectionId,
    analytics,
  };

  ensureBrowserTarget(dispatchCtx);
  const initialPage = createPageTarget(dispatchCtx, "about:blank");
  const arrivalClock = makeWallClock(dispatchCtx.env);

  const drainTimer = setInterval(() => {
    if (closed || browser.targets.size === 0) return;
    networkEvents.drain();
    drainInterception(connectionId);
    for (const t of browser.targets.values()) {
      pumpBackgroundEvents(dispatchCtx, t);
    }
  }, 200);
  if (typeof (drainTimer as { unref?: () => void }).unref === "function") {
    (drainTimer as { unref: () => void }).unref();
  }

  return {
    connectionId,
    initialTargetId: initialPage.targetId,
    browserState: browser,
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async send(req: CdpRequest): Promise<CdpResponse> {
      if (closed) {
        return {
          id: req.id,
          error: { code: -32000, message: "CDP session is closed" },
          sessionId: req.sessionId,
        };
      }
      markArrival(req, arrivalClock());
      try {
        return await dispatch(dispatchCtx, req);
      } catch (err) {
        return {
          id: req.id,
          error: {
            code: -32000,
            message: err instanceof Error ? err.message : String(err),
          },
          sessionId: req.sessionId,
        };
      }
    },
    isClosed() {
      return closed;
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      browser.wsClosing = true;
      clearInterval(drainTimer);
      stopSceneStreams(browser);
      for (const state of browser.screencasts.values()) state.stopped = true;
      browser.screencasts.clear();
      try {
        browser.rendererManager?.close("session closed");
      } catch {}
      unregisterTracker(connectionId);
      networkEvents.dispose();
      unregisterOutboundFilters(connectionId);
      unregisterRequestBlocker(connectionId);
      unregisterInterception(connectionId);
      disposeWebMcpConnection(connectionId);
      unregisterConnectionCookieJars(connectionId, browser.contexts.keys());
      dropConnectionImages(connectionId);
      unregisterIsolateLimitListenersFor(connectionId);
      browser.dedicatedWorkers.terminateAll("session closed");
      for (const target of browser.targets.values()) {
        try {
          target.pendingNavAbort?.abort();
        } catch {}
        target.pendingNavAbort = null;
        target.navigateGeneration++;
        void cancelAndRemoveTargetWheelQueues(browser, target.targetId);
        teardownOopifStubs(target, "session closed", undefined, {
          budget: browser.workerBudget,
          waitUntil: trackBg,
        });
        void retireStub(target, "wsClosed", "session closed", {
          budget: browser.workerBudget,
          waitUntil: trackBg,
        });
        releaseAllDomHandles(target);
      }
      const drainWait = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 50);
        if (typeof (timer as { unref?: () => void }).unref === "function") {
          (timer as { unref: () => void }).unref();
        }
      });
      await Promise.race([Promise.allSettled([...backgroundPromises]), drainWait]);
      listeners.clear();
    },
  };
}
