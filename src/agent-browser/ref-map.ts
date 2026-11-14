/**
 * Ref map tracking accessible elements as durable `@e1`, `@e2`, ... handles.
 * Matches `agent-browser`'s RefMap + RoleNameTracker design.
 */

export interface RefEntry {
  ref: string;
  role: string;
  name?: string;
  backendNodeId?: number;
  selector?: string;
  nth?: number;
  url?: string;
}

export class RoleNameTracker {
  private readonly counts = new Map<string, number>();
  private readonly entries: Array<{ ref: string; key: string; idx: number }> = [];

  private makeKey(role: string, name?: string): string {
    return `${role}\0${name ?? ""}`;
  }

  getNextIndex(role: string, name?: string): number {
    const key = this.makeKey(role, name);
    const current = this.counts.get(key) ?? 0;
    this.counts.set(key, current + 1);
    return current;
  }

  trackRef(role: string, name: string | undefined, ref: string): number {
    const key = this.makeKey(role, name);
    const idx = this.getNextIndex(role, name);
    this.entries.push({ ref, key, idx });
    return idx;
  }

  getDuplicateKeys(): Set<string> {
    const dups = new Set<string>();
    for (const [k, count] of this.counts.entries()) {
      if (count > 1) dups.add(k);
    }
    return dups;
  }
}

export class RefMap {
  private readonly map = new Map<string, RefEntry>();
  private counter = 0;

  clear(): void {
    this.map.clear();
    this.counter = 0;
  }

  nextRef(): string {
    this.counter += 1;
    return `e${this.counter}`;
  }

  add(ref: string, entry: Omit<RefEntry, "ref">): RefEntry {
    const full: RefEntry = { ref, ...entry };
    this.map.set(ref, full);
    return full;
  }

  get(input: string): RefEntry | undefined {
    const parsed = parseRef(input);
    return parsed ? this.map.get(parsed) : undefined;
  }

  entries(): RefEntry[] {
    return Array.from(this.map.values());
  }

  size(): number {
    return this.map.size;
  }
}

/** Parses `@e1`, `e1`, or `ref=e1` into normalized `e1`, or returns `null`. */
export function parseRef(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("@")) {
    const body = trimmed.slice(1);
    return /^e\d+$/.test(body) ? body : null;
  }
  if (trimmed.startsWith("ref=")) {
    const body = trimmed.slice(4);
    return /^e\d+$/.test(body) ? body : null;
  }
  return /^e\d+$/.test(trimmed) ? trimmed : null;
}
