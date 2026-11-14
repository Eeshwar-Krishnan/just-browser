// Minimal ambient Cloudflare Workers types needed to typecheck engine imports.
declare interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props?: Record<string, unknown>;
  exports?: Record<string, unknown>;
}

declare interface WorkerLoader {
  load(spec: Record<string, unknown>): {
    getEntrypoint<T = unknown>(name?: string, options?: { props?: Record<string, unknown> }): T;
  };
}

declare interface Env {
  LOADER: WorkerLoader;
  FONT_ASSETS: Fetcher;
  KITESURF_SIMULATE_PROD_EVAL?: string;
  KITESURF_RESOURCE_DRAIN_QUIET_TURNS?: string;
  KITESURF_PAGE_CPU_MS_CAP?: string;
  KITESURF_PAGE_WALL_MS_CAP?: string;
  KITESURF_LAG_WATCHDOG?: string;
  KITESURF_ALLOW_PRIVATE_NETWORK?: string;
  KITESURF_ENV?: string;
  KITESURF_VERSION?: string;
  HOST_TRACER?: unknown;
  HOST_CLOCK?: unknown;
  FIXTURES?: Fetcher;
  [key: string]: unknown;
}
