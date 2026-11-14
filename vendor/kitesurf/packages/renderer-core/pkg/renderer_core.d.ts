/* tslint:disable */
/* eslint-disable */

/**
 * Wasm replay interface with one session resource cache per instance.
 * Raster and PDF failures return empty bytes; diagnostics are available via `lastRasterizeInfo`.
 */
export class SceneRasterizer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Retire an engine-store image key whose payload is no longer available.
     * Later missing-resource scans skip it; absent images paint as a no-op.
     */
    abandonImage(key: string): number;
    /**
     * Apply `scene` at viewport-space `(dst_x, dst_y)` without encoding.
     * Returns `false` if `key` does not match the base or the scene cannot be replayed.
     */
    blitPartial(scene: Uint8Array, dst_x: number, dst_y: number, key: string): boolean;
    /**
     * Encode the retained frame, re-encoding only rows changed since its
     * last encode.
     * Returns empty bytes when `key` is not the retained base or encoding fails.
     */
    encodeRetained(format: string, quality: number, key: string): Uint8Array;
    /**
     * Diagnostics for the last rasterize call: JSON with the
     * error string (empty = ok) + degraded-frame counters.
     */
    lastRasterizeInfo(): string;
    /**
     * Scan a framed scene for resources the store can't satisfy.
     * Returns [count u32] + count × { kind u8, hash u64 (LE) }.
     */
    missingResources(scene: Uint8Array): Uint8Array;
    /**
     * Union missingResources over every scene in a PDF envelope
     * ([count u32] then per scene [len u32][framed bytes] — see
     * DomHandle::recordPdfScenes). Same wire encoding as
     * missingResources so the manager's split/fetch loop is shared.
     */
    missingResourcesPdf(envelope: Uint8Array): Uint8Array;
    /**
     * Create a rasterizer with an empty resource store and no retained frame.
     */
    constructor();
    /**
     * JSON array of { hash: "<u64 as decimal string>", path }
     * entries for font asset-refs awaiting putFontAsset.
     */
    pendingFontAssets(): string;
    /**
     * Engine-store image keys awaiting putImageBytes, as decimal
     * strings (a u64 doesn't survive a JS number). Format-3 refs
     * land here instead of being stored — see IMAGE_FORMAT_ENGINE_REF.
     */
    pendingImages(): string[];
    /**
     * Register a fetched font asset file (post-fetch bytes; woff2
     * is decompressed here). `path` matches pending asset-refs —
     * see ResourceStore::put_font_asset for why path, not hash.
     */
    putFontAsset(path: string, bytes: Uint8Array): number;
    /**
     * Supply the payload for one engine-store image ref. Returns 1 on
     * a successful decode, 0 for an unknown key or undecodable bytes.
     */
    putImageBytes(key: string, bytes: Uint8Array): number;
    /**
     * Ingest a PageScript render_rbi_resources reply. Returns the
     * number of entries stored; asset-refs land in the pending
     * list instead (see pendingFontAssets).
     */
    putResources(batch: Uint8Array): number;
    /**
     * Rasterize a framed scene to an encoded image. Empty Vec on
     * failure — read lastError for the reason. Format string and
     * quality clamp semantics match screenshot.rs encoders.
     */
    rasterize(scene: Uint8Array, format: string, quality: number, omit_background: boolean): Uint8Array;
    /**
     * Rasterize a full frame and retain its RGBA under `key` for later partial updates.
     * Only one base is kept per instance; oversized frames are returned but not retained.
     */
    rasterizeAndRetain(scene: Uint8Array, format: string, quality: number, omit_background: boolean, key: string): Uint8Array;
    /**
     * Composite a damage-rect scene at viewport-space `(dst_x, dst_y)` and encode the full frame.
     * Requires a retained frame with the same `key`.
     * Failures return empty bytes and set `lastRasterizeInfo`.
     */
    rasterizePartial(scene: Uint8Array, dst_x: number, dst_y: number, format: string, quality: number, key: string): Uint8Array;
    /**
     * Replay a `recordPdfScenes` envelope into a Krilla document, one scene per page.
     * Pages use a point-sized MediaBox, px-to-pt scale, and optional white fill.
     * Margins and `render_h` set paint bounds. Failures return empty bytes; read
     * `lastRasterizeInfo` for diagnostics.
     */
    renderPdf(envelope: Uint8Array, paper_width: number, paper_height: number, omit_background: boolean, margin_top: number, margin_right: number, margin_bottom: number, margin_left: number): Uint8Array;
    /**
     * Reserve scratch-buffer capacity for a `w`-by-`h` frame before rasterizing.
     * This does not create or replace a retained frame.
     */
    reserveFrame(w: number, h: number): void;
    /**
     * Drop every cached font and image. Batch entries are stored under the hash the page
     * reports, so the host calls this when the document that supplies them changes.
     */
    resetResources(): void;
    /**
     * Key of the currently retained base frame ("" = none). The JS
     * side gates its baseSeq handshake on this before opting in.
     */
    retainedFrameKey(): string;
    /**
     * Move the retained frame's pixels by (dx, dy) for a page scroll,
     * without encoding. The caller patches the exposed band with
     * `blitPartial`, then ships the frame with `encodeRetained`.
     * Returns `false` when `key` does not identify the retained frame.
     */
    shiftRetained(key: string, dx: number, dy: number): boolean;
}

export function ks_js_span_enter(op: string, bytes: number, detail: string): number;

export function ks_js_span_exit(slot: number): void;

export function ks_set_emit_hook(f?: Function | null): void;

export function set_ks_trace_parent(span_id_hex: string): void;

export function set_ks_tracing(enabled: boolean): void;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_scenerasterizer_free: (a: number, b: number) => void;
    readonly ks_js_span_enter: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly ks_js_span_exit: (a: number) => void;
    readonly ks_set_emit_hook: (a: number) => void;
    readonly scenerasterizer_abandonImage: (a: number, b: number, c: number) => number;
    readonly scenerasterizer_blitPartial: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly scenerasterizer_encodeRetained: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly scenerasterizer_lastRasterizeInfo: (a: number) => [number, number];
    readonly scenerasterizer_missingResources: (a: number, b: number, c: number) => [number, number];
    readonly scenerasterizer_missingResourcesPdf: (a: number, b: number, c: number) => [number, number];
    readonly scenerasterizer_new: () => number;
    readonly scenerasterizer_pendingFontAssets: (a: number) => [number, number];
    readonly scenerasterizer_pendingImages: (a: number) => [number, number];
    readonly scenerasterizer_putFontAsset: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly scenerasterizer_putImageBytes: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly scenerasterizer_putResources: (a: number, b: number, c: number) => number;
    readonly scenerasterizer_rasterize: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly scenerasterizer_rasterizeAndRetain: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly scenerasterizer_rasterizePartial: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly scenerasterizer_renderPdf: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly scenerasterizer_reserveFrame: (a: number, b: number, c: number) => void;
    readonly scenerasterizer_resetResources: (a: number) => void;
    readonly scenerasterizer_retainedFrameKey: (a: number) => [number, number];
    readonly scenerasterizer_shiftRetained: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly set_ks_trace_parent: (a: number, b: number) => void;
    readonly set_ks_tracing: (a: number) => void;
    readonly start: () => void;
    readonly __wbindgen_export: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
