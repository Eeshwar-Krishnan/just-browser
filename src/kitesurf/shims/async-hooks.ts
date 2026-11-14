/**
 * Pure-JS fallback for `node:async_hooks` (`AsyncLocalStorage`) so tracing-local.ts
 * works identically in browsers, Web Workers, and Node without requiring node:async_hooks.
 */

export class AsyncLocalStorage<T = unknown> {
  private current: T | undefined = undefined;

  getStore(): T | undefined {
    return this.current;
  }

  run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    const prev = this.current;
    this.current = store;
    try {
      return callback(...args);
    } finally {
      this.current = prev;
    }
  }

  enterWith(store: T): void {
    this.current = store;
  }

  disable(): void {
    this.current = undefined;
  }
}

export default { AsyncLocalStorage };
