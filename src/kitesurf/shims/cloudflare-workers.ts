/**
 * In-process shim for `cloudflare:workers` used by @kitesurf/engine,
 * @kitesurf/page-script, @kitesurf/page-renderer, and @kitesurf/worker-script.
 */

export class RpcTarget {}

export class WorkerEntrypoint<TEnv = Record<string, unknown>, TProps = Record<string, unknown>> {
  protected ctx: {
    props: TProps;
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  };
  protected env: TEnv;

  constructor(
    ctx?: {
      props?: TProps;
      waitUntil?: (promise: Promise<unknown>) => void;
      passThroughOnException?: () => void;
    },
    env?: TEnv,
  ) {
    this.ctx = {
      props: (ctx?.props ?? {}) as TProps,
      waitUntil: ctx?.waitUntil ?? ((p: Promise<unknown>) => { void p.catch(() => {}); }),
      passThroughOnException: ctx?.passThroughOnException ?? (() => {}),
    };
    this.env = (env ?? {}) as TEnv;
  }

  fetch(_request: Request): Promise<Response> | Response {
    return new Response("Not implemented", { status: 501 });
  }
}

export class DurableObject<TEnv = Record<string, unknown>> extends WorkerEntrypoint<TEnv> {}

export function abortIsolate(reason?: unknown): never {
  throw new Error(reason ? `Isolate aborted: ${String(reason)}` : "Isolate aborted");
}

export const env: Record<string, unknown> = {};
