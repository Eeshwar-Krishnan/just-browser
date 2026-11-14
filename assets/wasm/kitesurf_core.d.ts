/* tslint:disable */
/* eslint-disable */

export interface KsAttributeNamespace {
    qualifiedName: string;
    namespaceURI: string;
    prefix?: string;
    localName: string;
}
export interface KsNodeInfo {
    nodeId: number;
    backendNodeId: number;
    nodeType: number;
    nodeName: string;
    localName: string;
    nodeValue: string;
    childNodeCount: number;
    attributes?: string[];
    attributeNamespaces?: KsAttributeNamespace[];
    documentURL?: string;
    baseURL?: string;
    xmlVersion?: string;
    children?: KsNodeInfo[];
    shadowRoots?: KsNodeInfo[];
    shadowRootType?: "open" | "closed";
    namespaceURI?: string;
}



export interface KsLayoutRect {
    x: number;
    y: number;
    width: number;
    height: number;
    hasBox?: boolean;
}



export interface KsOffsetMetrics {
    parent: number;
    top: number;
    left: number;
}



export interface KsScrollInfo {
    scrollTop: number;
    scrollLeft: number;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
    clientTop: number;
    clientLeft: number;
    contentWidth: number;
    contentHeight: number;
    hasBox: boolean;
    overflowsX: boolean;
    overflowsY: boolean;
    userScrollableX: boolean;
    userScrollableY: boolean;
    stopScrollChainX: boolean;
    stopScrollChainY: boolean;
}
export interface KsScrollOffset {
    x: number;
    y: number;
}



/**
 * Holds one page's DOM and associated mutable state behind the Wasm handle.
 * Dropping the handle releases that state; Boa fast-path references hold only weak links.
 */
export class DomHandle {
    free(): void;
    [Symbol.dispose](): void;
    appendChildNode(parent_id: number, child_id: number): boolean;
    applyOps(json: string): number;
    assignedNodesOf(slot_id: number): Uint32Array;
    assignedSlotOf(node_id: number): number;
    attachShadow(host_id: number, mode: string): number;
    baseURL(): string;
    canonicalizeSelector(selector: string): string | undefined;
    canonicalizeSelectorNs(selector: string, prefixes: Record<string, string>): string | undefined;
    canvasApplyOps(node_id: number, ops_json: string): number;
    canvasEncodePng(node_id: number): Uint8Array;
    canvasFlush(node_id: number): number;
    canvasGetImageData(node_id: number, sx: number, sy: number, sw: number, sh: number): Uint8Array;
    canvasIsOriginClean(node_id: number): boolean;
    canvasIsPointInPath(node_id: number, x: number, y: number, even_odd: boolean): boolean;
    canvasMeasureText(text: string, font: string): string;
    canvasPutImageData(node_id: number, dx: number, dy: number, width: number, height: number, rgba: Uint8Array): number;
    canvasSerializeColor(css: string): string;
    canvasSourceInfo(node_id: number): { kind: "canvas" | "img"; src: string } | null;
    caretFromPoint(x: number, y: number): any;
    childIds(node_id: number): Uint32Array;
    clearCanvasPixels(node_id: number): void;
    clearDomSelection(): void;
    clearFocus(): void;
    clearIframeImage(node_id: number): void;
    closestInTree(node_id: number, selector: string): number;
    computedStyle(node_id: number): any;
    computedStylePseudo(node_id: number, pseudo: string): any;
    computedStyleValue(node_id: number, name: string): string | undefined;
    containingShadowRootId(node_id: number): number;
    createComment(text: string): number;
    createElement(tag_name: string): number;
    createElementNS(namespace_uri: string, qualified_name: string): number;
    createElementVerbatim(local_name: string, namespace_uri: string): number;
    createTextNode(text: string): number;
    debugDumpBorderColors(node_id: number): string;
    debugDumpInlineLayouts(): string;
    debugDumpLineOffsets(): string;
    debugDumpNodeChildren(node_id: number): string;
    debugDumpNodeLayout(node_id: number): string;
    debugDumpPseudoElements(node_id: number): string;
    deepCloneNode(node_id: number): number;
    deliverFontResource(request_id: number, bytes: Uint8Array, resource_key: string): boolean;
    deliverResource(request_id: number, bytes: Uint8Array): boolean;
    /**
     * Settle a pending fetch with an empty body.
     * Returns `false` if its request ID is no longer pending.
     */
    deliverResourceError(request_id: number): boolean;
    deliverResourceMeta(request_id: number, resource_key: string, width: number, height: number): boolean;
    descendantsOf(node_id: number): Uint32Array;
    detachedRoots(node_ids: Uint32Array): Int32Array;
    discoverPendingImages(): number;
    documentNodeId(): number;
    dropNode(node_id: number): boolean;
    elementFromPoint(x: number, y: number): number;
    fastpathBind(brand: Function, revalidate: Function, wrapper: Function, peek?: Function | null, node_list?: Function | null): void;
    fastpathMarkSpecial(node_id: number): void;
    fastpathStats(): string;
    fontsUpgraded(): void;
    forceFullRestyle(): number;
    static fromSerialized(bytes: Uint8Array, base_url: string): DomHandle;
    getBoundingClientRect(node_id: number): KsLayoutRect | null;
    getCommentData(node_id: number): string;
    getDocument(): KsNodeInfo | null;
    getElementById(id: string): number;
    getFocusedNodeId(): number;
    hasPendingCriticalResources(): boolean;
    hasPendingTransitions(): boolean;
    imageCacheHas(url: string): boolean;
    imageIsPending(node_id: number): boolean;
    imageNaturalSize(node_id: number): Uint32Array;
    /**
     * Document-space ink bounds for the transformed border box and descendants.
     * Null means no box. Partial frames use it for transform-only damage.
     */
    inkRect(node_id: number): Float64Array | undefined;
    innerHTML(node_id: number): string;
    innerTextRendered(node_id: number): string | null;
    insertBeforeNode(parent_id: number, new_child_id: number, ref_child_id: number): boolean;
    /**
     * Compute one Intersection Observer geometry result.
     * Margins are four `[value, is_percent]` pairs in top, right, bottom, left order.
     */
    intersectionGeometry(target_id: number, root_id: number, root_margin: Float32Array, scroll_margin: Float32Array, scroll_x: number, scroll_y: number, resolve: boolean): string;
    isAnimating(): boolean;
    isInclusiveAncestor(ancestor_id: number, node_id: number): boolean;
    isPoisoned(): boolean;
    /**
     * Deliberately does NOT resolve: IntersectionObserver samples the last committed layout.
     */
    layoutClean(): boolean;
    /**
     * Never resolves itself. With layoutClean, a poll whose epoch is
     * unchanged knows no box moved, so it can skip its geometry reads.
     */
    layoutEpoch(): number;
    layoutMode(): string;
    matchesInSubtree(node_id: number, selector: string): boolean;
    /**
     * Byte-taking twin of `matchesInSubtree`. Selector text can come from a sheet the page
     * cannot read, and wasm-bindgen marshals `&str` through `charCodeAt`/`encodeInto`, which
     * page JS can replace. The caller encodes the text itself and passes the bytes instead.
     * Invalid UTF-8 matches nothing.
     */
    matchesInSubtreeBytes(node_id: number, selector: Uint8Array): boolean;
    /**
     * Parse `html` into a page document and use `base_url` for relative resources.
     * Invalid URLs and URLs that cannot serve as a base use `https://kitesurf.local/`.
     */
    constructor(html: string, base_url: string);
    nodeCount(): number;
    nodeInfo(node_id: number): KsNodeInfo | null;
    nodeScrollInfo(node_id: number): KsScrollInfo | null;
    nodeSubtree(node_id: number): KsNodeInfo | null;
    nonLatinTextWrites(): number;
    notRenderedNodeIds(): any;
    offsetMetrics(node_id: number): KsOffsetMetrics | null;
    outerHTML(node_id: number): string;
    pageBoxJson(): string;
    /**
     * Start counting the damage a caller attributes to its next input; what was
     * already pending goes to the screencast, so it is never read as the input's.
     */
    paintDamageMark(): void;
    /**
     * Nodes damaged since the last mark or read, as JSON `{ids, overflow}`, leaving out
     * `exclude`, its subtree and its ancestors: a control's own hover and focus restyle.
     */
    paintDamageSince(exclude: number): string;
    panicProbe(kind: string): number;
    parentId(node_id: number): number;
    pendingAuthorFontUpgrades(): string[];
    pendingImageNodes(url: string): Uint32Array;
    pendingImagesCount(): number;
    pinnedRects(): Float64Array | undefined;
    prepareForPaint(width: number, height: number): number;
    pseudoKindAtPoint(x: number, y: number): number;
    pumpResourceMessages(): void;
    querySelector(selector: string): number;
    querySelectorAll(selector: string): Int32Array;
    querySelectorAllInSubtree(root_id: number, selector: string): Int32Array;
    recordPdfScenes(width: number, height: number, margin_top: number, margin_right: number, margin_bottom: number, margin_left: number): Uint8Array;
    removeAttribute(node_id: number, name: string): boolean;
    removeNode(node_id: number): boolean;
    renderRbiResources(glyph_hashes: Uint8Array, font_metric_hashes: Uint8Array, image_hashes: Uint8Array, font_data_hashes: Uint8Array): Uint8Array;
    renderScene(scroll_x: number, scroll_y: number, overdraw_top: number, overdraw_bottom: number, omit_background: boolean, client_wire: boolean): Uint8Array;
    renderSceneClip(clip_x: number, clip_y: number, clip_w: number, clip_h: number, omit_background: boolean, client_wire: boolean): Uint8Array;
    renderSceneClipRaw(clip_x: number, clip_y: number, clip_w: number, clip_h: number, omit_background: boolean, client_wire: boolean): Uint8Array;
    renderSceneInlineResources(scene: Uint8Array, have_images: Uint8Array, have_fonts: Uint8Array): Uint8Array;
    renderSceneRaw(scroll_x: number, scroll_y: number, overdraw_top: number, overdraw_bottom: number, omit_background: boolean, client_wire: boolean): Uint8Array;
    /**
     * Keeps the raw scene in linear memory; `stagedScenePtr` locates its
     * bytes until the next call. JS can copy them into a pooled ArrayBuffer
     * instead of allocating one for every canvas frame.
     */
    renderSceneRawStaged(scroll_x: number, scroll_y: number, overdraw_top: number, overdraw_bottom: number, omit_background: boolean, client_wire: boolean): number;
    renderSceneRoundtrip(scroll_x: number, scroll_y: number): string;
    renderSceneStats(scroll_x: number, scroll_y: number): string;
    replaceChildNode(new_child_id: number, old_child_id: number): boolean;
    /**
     * ResizeObserver's two boxes in one call: `[contentWidth, contentHeight, borderWidth,
     * borderHeight]` from the layout box, so transforms do not count. A node that generates no
     * box measures zero. Empty when there is no layout to read, so the caller falls back to its
     * CSSOM reads. With `resolve` false this reads the last committed layout.
     */
    resizeObserverBoxes(node_id: number, resolve: boolean): Float32Array;
    /**
     * `[mutationResolves, animationResolves]` since the document was built.
     */
    resolveCounts(): Uint32Array;
    resolveLayout(): void;
    scrollNodeBy(node_id: number, dx: number, dy: number): boolean;
    serialize(): Uint8Array;
    /**
     * Whether the resolve should collect CSS animation events. Only
     * true while the isolate has an `animation*` listener; see the
     * `animation_events_requested` field docs. Flips on
     * `armTransitionDrain(true/false)` in page-script.
     */
    setAnimationEventsRequested(requested: boolean): void;
    setAttribute(node_id: number, name: string, value: string): boolean;
    setCanvasPixels(node_id: number, width: number, height: number, rgba: Uint8Array): number;
    /**
     * Update live checkedness and restyle the input and parent for `:checked` siblings.
     * The `checked` attribute is `defaultChecked` and stays untouched; rebuilt paint documents
     * serialize live checkedness instead. Returns false for stale or non-checkable IDs.
     */
    setCheckboxChecked(node_id: number, checked: boolean): boolean;
    setCommentData(node_id: number, text: string): boolean;
    setDomSelection(anchor_id: number, anchor_offset: number, focus_id: number, focus_offset: number): boolean;
    setFocus(node_id: number): boolean;
    setIframeImage(node_id: number, width: number, height: number, rgba: Uint8Array): number;
    setInputSelection(node_id: number, start: number, end: number): boolean;
    setInputText(node_id: number, value: string): boolean;
    setLayoutMode(mode: string): void;
    setMediaType(media: string): void;
    setNodeScrollOffset(node_id: number, x: number, y: number): KsScrollOffset | null;
    setNodeText(node_id: number, text: string): boolean;
    setPageScroll(x: number, y: number): void;
    setSelectLabel(node_id: number, text?: string | null): boolean;
    setViewport(width: number, height: number): void;
    shadowHostId(node_id: number): number;
    shadowRootId(host_id: number): number;
    /**
     * Address of the last staged scene in linear memory.
     */
    stagedScenePtr(): number;
    stickyShift(node_id: number): Float32Array;
    /**
     * Does not resolve, like `takeTransitionEvents`.
     */
    takeAnimationEvents(): any;
    takeDamageSummary(): string;
    /**
     * Does not resolve. The drain tick in transitions.ts decides whether its turn needs
     * `resolveLayout`; a resolve here would re-cascade every running animation on each tick.
     */
    takeTransitionEvents(): any;
    textContent(node_id: number): string;
    textUsesCodepoints(ranges: Uint32Array): boolean;
    title(): string;
    viewportSize(): Uint32Array;
    /**
     * Return `getComputedTiming()` fields from the same model sampled by the cascade.
     * Returns `[phase, activeDuration, endTime, progress, currentIteration]`; phase is 0
     * before, 1 active, 2 after, 3 idle. Missing progress or iteration is NaN; the shim maps
     * it to null.
     */
    waapiComputedTiming(timing: Float64Array, easing: string, local_time: number | null | undefined, rate: number): Float64Array;
    /**
     * Drop animation `id` (canceled, or its Animation collected); its target restyles
     * without it on the next resolve.
     */
    waapiRemove(id: number): void;
    /**
     * Create or replace animation `id`'s keyframe effect on `node_id` (0: no target).
     * Errs with the TypeError message Chrome throws for an invalid easing.
     */
    waapiSetEffect(id: number, node_id: number, keyframes_json: string, timing: Float64Array, easing: string): void;
    /**
     * Animation `id`'s current time is `hold_ms` when given, else the animation clock
     * (Date.now()-based epoch ms, as `now_for_animations`) since `start_epoch_ms` at `rate`.
     */
    waapiSetPlayback(id: number, start_epoch_ms: number | null | undefined, hold_ms: number | null | undefined, rate: number): void;
}

export class KeyOutcome {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly handled: boolean;
    readonly navigate: string | undefined;
    readonly redraw: boolean;
}

export class ModePicker {
    free(): void;
    [Symbol.dispose](): void;
    close(): void;
    currentSlug(): string;
    handleKey(key: string): PickResult;
    isOpen(): boolean;
    constructor(current: string);
    open(): void;
    pressAt(col: number, row: number, cols: number, rows: number): PickResult;
    render(cols: number, rows: number): string;
    setCurrent(slug: string): void;
}

export class Omni {
    free(): void;
    [Symbol.dispose](): void;
    beginEdit(): void;
    canBack(): boolean;
    canForward(): boolean;
    cancelEdit(): void;
    clear_hover(): boolean;
    commitEdit(): string | undefined;
    currentUrl(): string;
    cursorCol(cols: number): number | undefined;
    editCursor(): number;
    editText(): string;
    handleKey(key: string, text: string, alt: boolean, ctrl: boolean): KeyOutcome;
    hitName(col: number, cols: number): string;
    hover_at(col: number, cols: number): boolean;
    isEditing(): boolean;
    isLoading(): boolean;
    constructor(url: string);
    notePainted(): void;
    pressAt(col: number, cols: number, on_chrome: boolean): PressOutcome;
    pushText(s: string): void;
    push_char(c: string): void;
    render(cols: number): string;
    renderRule(cols: number): string;
    setLoading(v: boolean): void;
    setNav(url: string, can_back: boolean, can_fwd: boolean, loading: boolean): boolean;
    tick(): boolean;
}

export class PickResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly chosen: string;
    readonly handled: boolean;
    readonly redraw: boolean;
}

export class PressOutcome {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly hit: string;
    readonly redraw: boolean;
}

export class RuleStyleDeclarationStore {
    free(): void;
    [Symbol.dispose](): void;
    cascadeText(): string;
    cssText(): string;
    getPropertyPriority(name: string): string;
    getPropertyValue(name: string): string;
    hasProperty(name: string): boolean;
    item(index: number): string;
    length(): number;
    constructor(context: string, css_text: string, base_url: string);
    removeProperty(name: string): string;
    setCssText(css_text: string): void;
    setProperty(name: string, value: string, priority: string): boolean;
}

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

export class TtyRenderer {
    free(): void;
    [Symbol.dispose](): void;
    abandonImage(key: string): number;
    cellCollisions(): number;
    imagesMissing(): number;
    imagesPlaced(): number;
    missingImages(scene: Uint8Array): Uint8Array;
    constructor();
    pendingImages(): string[];
    placementCount(): number;
    placementMeta(): string;
    placementPng(i: number): Uint8Array;
    putImageBytes(key: string, bytes: Uint8Array): number;
    putResources(batch: Uint8Array): number;
    sceneToAnsi(scene: Uint8Array, cols: number, rows: number, cell_w: number, cell_h: number): string;
    setImageMode(mode: string): void;
}

export function decodeTermInput(buf: Uint8Array): string;

/**
 * JS-callable: flip Lazy→Full once every recorded face has been
 * swapped, so later lazy registrations fetch full files directly.
 */
export function finishFontUpgrade(): boolean;

/**
 * Return each registered family and its face attributes as JSON.
 */
export function font_families_json(): string;

export function ks_boa_force_collect(): string;

export function ks_bridge_buffer_bytes(v: any): any;

export function ks_bridge_ever_minted(): boolean;

export function ks_bridge_install_desc_helpers(data: Function, accessor: Function): void;

export function ks_bridge_pins(): string;

export function ks_call_cdp(fn_src: string, this_v8: any, args_v8: Array<any>, await_promise: boolean, return_by_value: boolean): Promise<any>;

export function ks_canonicalize_page_selectors(prelude: string): string | undefined;

/**
 * What compiled code retains, by form: the counters boa keeps behind the code store. Pairs
 * are already camelCase, so they land in `bridge.boaCode` as they are.
 */
export function ks_code_stats(): string;

export function ks_counter_style_rule(css: string, field: string, value: string): any;

/**
 * Runs one epoch of the cross-heap cycle collector and returns its wall time in ms. With
 * `idle_skip`, an epoch whose inputs are unchanged is skipped and returns 0.
 */
export function ks_cycle_collect(idle_skip: boolean): number;

export function ks_cycle_stats(): string;

export function ks_encode_html(encoding: string, input: string): Uint8Array;

export function ks_encoding_name(label: string): string | undefined;

export function ks_eval(src: string, await_promise: boolean): Promise<any>;

export function ks_eval_cdp(src: string, await_promise: boolean, return_by_value: boolean): Promise<any>;

export function ks_eval_page(src: string): any;

export function ks_eval_sync(src: string): string;

export function ks_get_property_value(css: string, property: string): string;

export function ks_import(specifier: string, referrer_url: string, module_type?: string | null): Promise<any>;

export function ks_is_bridged(v: any): boolean;

export function ks_js_span_enter(op: string, bytes: number, detail: string): number;

export function ks_js_span_exit(slot: number): void;

export function ks_parse_inline_style(css: string): any;

export function ks_parse_stylesheet(css: string): string;

export function ks_parse_stylesheet_structured(css: string): any;

export function ks_parse_typed_numeric_value(css_text: string): any;

export function ks_parse_typed_style_value(property: string, css_text: string): any;

export function ks_percent_encode_after_encoding(encoding: string, input: string, set: number, space_as_plus: boolean): string;

/**
 * Render HTML to PNG, JPEG, or WebP; unknown formats and RGBA fall back to PNG.
 * Quality is clamped to 1 to 100 and applies only to JPEG. HTTP resources are
 * not fetched, so callers must inline their stylesheets and external images.
 * An unusable base URL uses `https://kitesurf.local/`; failures return empty bytes.
 */
export function ks_render_html_to_image(html: string, base_url: string, width: number, height: number, format: string, quality: number): Uint8Array;

/**
 * Compatibility export for callers that only need PNG output.
 */
export function ks_render_html_to_png(html: string, base_url: string, width: number, height: number): Uint8Array;

export function ks_run_page_jobs(): void;

export function ks_scan_document(html: string): string;

export function ks_serialize_inline_style(css: string): string;

export function ks_set_boa_strict(v: boolean): void;

export function ks_set_code_store(min_bytes: number, put?: Function | null, read?: Function | null, release?: Function | null, flush?: Function | null): void;

export function ks_set_emit_hook(f?: Function | null): void;

export function ks_set_swap_budget(bytes: number): void;

export function ks_spike_await(promise: Promise<any>): Promise<any>;

export function ks_spike_boa_await(js_promise: Promise<any>): Promise<any>;

export function ks_stylo_smoke(): string;

/**
 * What the counting allocator has seen: live bytes, the swap budget and the rounds it forced.
 * Reported beside the bridge's gauges, since a page's wasm memory is what the swap acts on.
 */
export function ks_swap_alloc_stats(): string;

export function ks_ua_stylesheet(): string;

export function ks_validate_selector(selector: string): string;

/**
 * Return the registered mono advance per em, or zero when unavailable.
 */
export function monoAdvancePerEm(): number;

export function osc52(text: string): string;

/**
 * JS-callable: asset paths awaiting the full-file swap, in
 * registration order. Empty array outside Lazy mode.
 */
export function pendingLazyFontPaths(): string[];

/**
 * Register Noto Sans CJK SC for Han, Hiragana, Katakana, and Hangul fallbacks.
 * Regional aliases, including Simplified Chinese variants, share one blob.
 * Add it after emoji in Common for ideographic spaces and fullwidth punctuation.
 * Returns true only on the first registration.
 */
export function register_cjk_font(bytes: Uint8Array): boolean;

/**
 * Register fetched WOFF2 or raw OpenType emoji bytes in the shared context.
 * Aliases share one Blob and join Common fallback, so CSS need not name an
 * emoji family.
 * Returns true on the first call and false thereafter.
 */
export function register_emoji_font(bytes: Uint8Array): boolean;

/**
 * Register a fetched Noto face in its script fallback chain. Idempotent per tag.
 * Empty bytes or non-four-byte tags return false. Unknown tags also return false
 * because the renderer needs a matching asset path.
 */
export function register_script_font(bytes: Uint8Array, script_tag: string): boolean;

/**
 * Lazily register symbol fallback faces. Symbols bytes are required; Symbols 2
 * is optional. Later calls return false.
 */
export function register_symbol_fonts(symbols_bytes: Uint8Array, symbols2_bytes: Uint8Array): boolean;

/**
 * Register UA fonts before constructing a DomHandle. Sans and italic are
 * required; serif and mono are optional. Missing required bytes or duplicate
 * calls return false. Empty mono leaves the generic on its sans fallback.
 */
export function register_ua_fonts(sans_bytes: Uint8Array, sans_italic_bytes: Uint8Array, serif_bytes: Uint8Array, mono_bytes: Uint8Array): boolean;

export function sceneToAnsi(scene: Uint8Array, cols: number, rows: number, cell_w: number, cell_h: number): string;

export function setDarkColorScheme(dark: boolean): void;

export function setDimsOnlyImages(enabled: boolean): void;

/**
 * Lazy paint sessions: shaping-only faces until the first in-isolate
 * outline consumer (canvas text, svg <text>, printToPDF) upgrades.
 */
export function setFontShapingLazy(enabled: boolean): void;

/**
 * Pixel-free sessions: no pixel ever leaves the connection, so
 * glyph outlines are dead weight. Distinct from renderer_mode().
 */
export function setPixelFreeSession(enabled: boolean): void;

export function setTtyCellGrid(w: number, h: number): void;

export function setTtyUaCss(css: string): void;

export function set_ks_trace_parent(span_id_hex: string): void;

export function set_ks_tracing(enabled: boolean): void;

export function start(): void;

export function stripFontForShaping(bytes: Uint8Array): Uint8Array | undefined;

/**
 * JS-callable: swap one author face set to its full file (custody
 * or re-fetched bytes). Decompresses the woff container, then
 * unregister + re-register under the SAME family name/attrs so the
 * FamilyId — and every style rule resolving it — survives.
 */
export function upgradeAuthorFontFace(url: string, full_bytes: Uint8Array): boolean;

/**
 * JS-callable: swap one recorded face to its full file. Returns
 * true when the swap happened (see upgrade_recorded_face).
 */
export function upgradeFontFace(path: string, full_bytes: Uint8Array): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_domhandle_free: (a: number, b: number) => void;
    readonly __wbg_keyoutcome_free: (a: number, b: number) => void;
    readonly __wbg_modepicker_free: (a: number, b: number) => void;
    readonly __wbg_omni_free: (a: number, b: number) => void;
    readonly __wbg_pickresult_free: (a: number, b: number) => void;
    readonly __wbg_rulestyledeclarationstore_free: (a: number, b: number) => void;
    readonly __wbg_scenerasterizer_free: (a: number, b: number) => void;
    readonly __wbg_ttyrenderer_free: (a: number, b: number) => void;
    readonly decodeTermInput: (a: number, b: number) => [number, number];
    readonly domhandle_appendChildNode: (a: number, b: number, c: number) => number;
    readonly domhandle_applyOps: (a: number, b: number, c: number) => [number, number, number];
    readonly domhandle_assignedNodesOf: (a: number, b: number) => [number, number];
    readonly domhandle_assignedSlotOf: (a: number, b: number) => number;
    readonly domhandle_attachShadow: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_baseURL: (a: number) => [number, number];
    readonly domhandle_canonicalizeSelector: (a: number, b: number, c: number) => [number, number];
    readonly domhandle_canonicalizeSelectorNs: (a: number, b: number, c: number, d: any) => [number, number];
    readonly domhandle_canvasApplyOps: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_canvasEncodePng: (a: number, b: number) => [number, number];
    readonly domhandle_canvasFlush: (a: number, b: number) => number;
    readonly domhandle_canvasGetImageData: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly domhandle_canvasIsOriginClean: (a: number, b: number) => number;
    readonly domhandle_canvasIsPointInPath: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly domhandle_canvasMeasureText: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly domhandle_canvasPutImageData: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly domhandle_canvasSerializeColor: (a: number, b: number, c: number) => [number, number];
    readonly domhandle_canvasSourceInfo: (a: number, b: number) => [number, number, number];
    readonly domhandle_caretFromPoint: (a: number, b: number, c: number) => any;
    readonly domhandle_childIds: (a: number, b: number) => [number, number];
    readonly domhandle_clearCanvasPixels: (a: number, b: number) => void;
    readonly domhandle_clearDomSelection: (a: number) => void;
    readonly domhandle_clearFocus: (a: number) => void;
    readonly domhandle_clearIframeImage: (a: number, b: number) => void;
    readonly domhandle_closestInTree: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly domhandle_computedStyle: (a: number, b: number) => [number, number, number];
    readonly domhandle_computedStylePseudo: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly domhandle_computedStyleValue: (a: number, b: number, c: number, d: number) => [number, number];
    readonly domhandle_containingShadowRootId: (a: number, b: number) => number;
    readonly domhandle_createComment: (a: number, b: number, c: number) => number;
    readonly domhandle_createElement: (a: number, b: number, c: number) => number;
    readonly domhandle_createElementNS: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly domhandle_createElementVerbatim: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly domhandle_createTextNode: (a: number, b: number, c: number) => number;
    readonly domhandle_debugDumpBorderColors: (a: number, b: number) => [number, number];
    readonly domhandle_debugDumpInlineLayouts: (a: number) => [number, number];
    readonly domhandle_debugDumpLineOffsets: (a: number) => [number, number];
    readonly domhandle_debugDumpNodeChildren: (a: number, b: number) => [number, number];
    readonly domhandle_debugDumpNodeLayout: (a: number, b: number) => [number, number];
    readonly domhandle_debugDumpPseudoElements: (a: number, b: number) => [number, number];
    readonly domhandle_deepCloneNode: (a: number, b: number) => number;
    readonly domhandle_deliverFontResource: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly domhandle_deliverResource: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_deliverResourceError: (a: number, b: number) => number;
    readonly domhandle_deliverResourceMeta: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly domhandle_descendantsOf: (a: number, b: number) => [number, number];
    readonly domhandle_detachedRoots: (a: number, b: number, c: number) => [number, number];
    readonly domhandle_discoverPendingImages: (a: number) => number;
    readonly domhandle_documentNodeId: (a: number) => number;
    readonly domhandle_dropNode: (a: number, b: number) => number;
    readonly domhandle_elementFromPoint: (a: number, b: number, c: number) => number;
    readonly domhandle_fastpathBind: (a: number, b: any, c: any, d: any, e: number, f: number) => void;
    readonly domhandle_fastpathMarkSpecial: (a: number, b: number) => void;
    readonly domhandle_fastpathStats: (a: number) => [number, number];
    readonly domhandle_fontsUpgraded: (a: number) => void;
    readonly domhandle_forceFullRestyle: (a: number) => number;
    readonly domhandle_fromSerialized: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly domhandle_getBoundingClientRect: (a: number, b: number) => [number, number, number];
    readonly domhandle_getCommentData: (a: number, b: number) => [number, number];
    readonly domhandle_getDocument: (a: number) => [number, number, number];
    readonly domhandle_getElementById: (a: number, b: number, c: number) => number;
    readonly domhandle_getFocusedNodeId: (a: number) => number;
    readonly domhandle_hasPendingCriticalResources: (a: number) => number;
    readonly domhandle_hasPendingTransitions: (a: number) => number;
    readonly domhandle_imageCacheHas: (a: number, b: number, c: number) => number;
    readonly domhandle_imageIsPending: (a: number, b: number) => number;
    readonly domhandle_imageNaturalSize: (a: number, b: number) => [number, number];
    readonly domhandle_inkRect: (a: number, b: number) => [number, number];
    readonly domhandle_innerHTML: (a: number, b: number) => [number, number];
    readonly domhandle_innerTextRendered: (a: number, b: number) => any;
    readonly domhandle_insertBeforeNode: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_intersectionGeometry: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly domhandle_isAnimating: (a: number) => number;
    readonly domhandle_isInclusiveAncestor: (a: number, b: number, c: number) => number;
    readonly domhandle_isPoisoned: (a: number) => number;
    readonly domhandle_layoutClean: (a: number) => number;
    readonly domhandle_layoutEpoch: (a: number) => number;
    readonly domhandle_layoutMode: (a: number) => [number, number];
    readonly domhandle_matchesInSubtree: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly domhandle_matchesInSubtreeBytes: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly domhandle_new: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_nodeCount: (a: number) => number;
    readonly domhandle_nodeInfo: (a: number, b: number) => [number, number, number];
    readonly domhandle_nodeScrollInfo: (a: number, b: number) => [number, number, number];
    readonly domhandle_nodeSubtree: (a: number, b: number) => [number, number, number];
    readonly domhandle_nonLatinTextWrites: (a: number) => number;
    readonly domhandle_notRenderedNodeIds: (a: number) => [number, number, number];
    readonly domhandle_offsetMetrics: (a: number, b: number) => [number, number, number];
    readonly domhandle_outerHTML: (a: number, b: number) => [number, number];
    readonly domhandle_pageBoxJson: (a: number) => [number, number];
    readonly domhandle_paintDamageMark: (a: number) => void;
    readonly domhandle_paintDamageSince: (a: number, b: number) => [number, number];
    readonly domhandle_panicProbe: (a: number, b: number, c: number) => number;
    readonly domhandle_parentId: (a: number, b: number) => number;
    readonly domhandle_pendingAuthorFontUpgrades: (a: number) => [number, number];
    readonly domhandle_pendingImageNodes: (a: number, b: number, c: number) => [number, number];
    readonly domhandle_pendingImagesCount: (a: number) => number;
    readonly domhandle_pinnedRects: (a: number) => [number, number];
    readonly domhandle_prepareForPaint: (a: number, b: number, c: number) => number;
    readonly domhandle_pseudoKindAtPoint: (a: number, b: number, c: number) => number;
    readonly domhandle_pumpResourceMessages: (a: number) => void;
    readonly domhandle_querySelector: (a: number, b: number, c: number) => [number, number, number];
    readonly domhandle_querySelectorAll: (a: number, b: number, c: number) => [number, number, number, number];
    readonly domhandle_querySelectorAllInSubtree: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly domhandle_recordPdfScenes: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly domhandle_removeAttribute: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_removeNode: (a: number, b: number) => number;
    readonly domhandle_renderRbiResources: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly domhandle_renderScene: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly domhandle_renderSceneClip: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly domhandle_renderSceneClipRaw: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly domhandle_renderSceneInlineResources: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly domhandle_renderSceneRaw: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly domhandle_renderSceneRawStaged: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly domhandle_renderSceneRoundtrip: (a: number, b: number, c: number) => [number, number];
    readonly domhandle_renderSceneStats: (a: number, b: number, c: number) => [number, number];
    readonly domhandle_replaceChildNode: (a: number, b: number, c: number) => number;
    readonly domhandle_resizeObserverBoxes: (a: number, b: number, c: number) => [number, number];
    readonly domhandle_resolveCounts: (a: number) => [number, number];
    readonly domhandle_resolveLayout: (a: number) => void;
    readonly domhandle_scrollNodeBy: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_serialize: (a: number) => [number, number, number, number];
    readonly domhandle_setAnimationEventsRequested: (a: number, b: number) => void;
    readonly domhandle_setAttribute: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly domhandle_setCanvasPixels: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly domhandle_setCheckboxChecked: (a: number, b: number, c: number) => number;
    readonly domhandle_setCommentData: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_setDomSelection: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly domhandle_setFocus: (a: number, b: number) => number;
    readonly domhandle_setIframeImage: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly domhandle_setInputSelection: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_setInputText: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_setLayoutMode: (a: number, b: number, c: number) => void;
    readonly domhandle_setMediaType: (a: number, b: number, c: number) => void;
    readonly domhandle_setNodeScrollOffset: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly domhandle_setNodeText: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_setPageScroll: (a: number, b: number, c: number) => void;
    readonly domhandle_setSelectLabel: (a: number, b: number, c: number, d: number) => number;
    readonly domhandle_setViewport: (a: number, b: number, c: number) => void;
    readonly domhandle_shadowHostId: (a: number, b: number) => number;
    readonly domhandle_shadowRootId: (a: number, b: number) => number;
    readonly domhandle_stagedScenePtr: (a: number) => number;
    readonly domhandle_stickyShift: (a: number, b: number) => [number, number];
    readonly domhandle_takeAnimationEvents: (a: number) => [number, number, number];
    readonly domhandle_takeDamageSummary: (a: number) => [number, number];
    readonly domhandle_takeTransitionEvents: (a: number) => [number, number, number];
    readonly domhandle_textContent: (a: number, b: number) => [number, number];
    readonly domhandle_textUsesCodepoints: (a: number, b: number, c: number) => number;
    readonly domhandle_title: (a: number) => [number, number];
    readonly domhandle_viewportSize: (a: number) => [number, number];
    readonly domhandle_waapiComputedTiming: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly domhandle_waapiRemove: (a: number, b: number) => void;
    readonly domhandle_waapiSetEffect: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly domhandle_waapiSetPlayback: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly finishFontUpgrade: () => number;
    readonly font_families_json: () => [number, number];
    readonly keyoutcome_handled: (a: number) => number;
    readonly keyoutcome_navigate: (a: number) => [number, number];
    readonly keyoutcome_redraw: (a: number) => number;
    readonly ks_boa_force_collect: () => [number, number];
    readonly ks_bridge_buffer_bytes: (a: any) => any;
    readonly ks_bridge_ever_minted: () => number;
    readonly ks_bridge_install_desc_helpers: (a: any, b: any) => void;
    readonly ks_bridge_pins: () => [number, number];
    readonly ks_call_cdp: (a: number, b: number, c: any, d: any, e: number, f: number) => any;
    readonly ks_canonicalize_page_selectors: (a: number, b: number) => [number, number];
    readonly ks_code_stats: () => [number, number];
    readonly ks_counter_style_rule: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly ks_cycle_collect: (a: number) => number;
    readonly ks_cycle_stats: () => [number, number];
    readonly ks_encode_html: (a: number, b: number, c: number, d: number) => [number, number];
    readonly ks_encoding_name: (a: number, b: number) => [number, number];
    readonly ks_eval: (a: number, b: number, c: number) => any;
    readonly ks_eval_cdp: (a: number, b: number, c: number, d: number) => any;
    readonly ks_eval_page: (a: number, b: number) => [number, number, number];
    readonly ks_eval_sync: (a: number, b: number) => [number, number];
    readonly ks_get_property_value: (a: number, b: number, c: number, d: number) => [number, number];
    readonly ks_import: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
    readonly ks_is_bridged: (a: any) => number;
    readonly ks_js_span_enter: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly ks_js_span_exit: (a: number) => void;
    readonly ks_parse_inline_style: (a: number, b: number) => [number, number, number];
    readonly ks_parse_stylesheet: (a: number, b: number) => [number, number];
    readonly ks_parse_stylesheet_structured: (a: number, b: number) => [number, number, number];
    readonly ks_parse_typed_numeric_value: (a: number, b: number) => [number, number, number];
    readonly ks_parse_typed_style_value: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly ks_percent_encode_after_encoding: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly ks_render_html_to_image: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number];
    readonly ks_render_html_to_png: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly ks_run_page_jobs: () => void;
    readonly ks_scan_document: (a: number, b: number) => [number, number];
    readonly ks_serialize_inline_style: (a: number, b: number) => [number, number];
    readonly ks_set_boa_strict: (a: number) => void;
    readonly ks_set_code_store: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly ks_set_emit_hook: (a: number) => void;
    readonly ks_set_swap_budget: (a: number) => void;
    readonly ks_spike_await: (a: any) => any;
    readonly ks_spike_boa_await: (a: any) => any;
    readonly ks_stylo_smoke: () => [number, number];
    readonly ks_swap_alloc_stats: () => [number, number];
    readonly ks_ua_stylesheet: () => [number, number];
    readonly ks_validate_selector: (a: number, b: number) => [number, number];
    readonly modepicker_close: (a: number) => void;
    readonly modepicker_currentSlug: (a: number) => [number, number];
    readonly modepicker_handleKey: (a: number, b: number, c: number) => number;
    readonly modepicker_isOpen: (a: number) => number;
    readonly modepicker_new: (a: number, b: number) => number;
    readonly modepicker_open: (a: number) => void;
    readonly modepicker_pressAt: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly modepicker_render: (a: number, b: number, c: number) => [number, number];
    readonly modepicker_setCurrent: (a: number, b: number, c: number) => void;
    readonly monoAdvancePerEm: () => number;
    readonly omni_beginEdit: (a: number) => void;
    readonly omni_canBack: (a: number) => number;
    readonly omni_canForward: (a: number) => number;
    readonly omni_cancelEdit: (a: number) => void;
    readonly omni_clear_hover: (a: number) => number;
    readonly omni_commitEdit: (a: number) => [number, number];
    readonly omni_currentUrl: (a: number) => [number, number];
    readonly omni_cursorCol: (a: number, b: number) => number;
    readonly omni_editCursor: (a: number) => number;
    readonly omni_editText: (a: number) => [number, number];
    readonly omni_handleKey: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly omni_hitName: (a: number, b: number, c: number) => [number, number];
    readonly omni_hover_at: (a: number, b: number, c: number) => number;
    readonly omni_isEditing: (a: number) => number;
    readonly omni_isLoading: (a: number) => number;
    readonly omni_new: (a: number, b: number) => number;
    readonly omni_notePainted: (a: number) => void;
    readonly omni_pressAt: (a: number, b: number, c: number, d: number) => number;
    readonly omni_pushText: (a: number, b: number, c: number) => void;
    readonly omni_push_char: (a: number, b: number) => void;
    readonly omni_render: (a: number, b: number) => [number, number];
    readonly omni_renderRule: (a: number, b: number) => [number, number];
    readonly omni_setLoading: (a: number, b: number) => void;
    readonly omni_setNav: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly omni_tick: (a: number) => number;
    readonly osc52: (a: number, b: number) => [number, number];
    readonly pendingLazyFontPaths: () => [number, number];
    readonly pickresult_chosen: (a: number) => [number, number];
    readonly pickresult_handled: (a: number) => number;
    readonly pickresult_redraw: (a: number) => number;
    readonly register_cjk_font: (a: number, b: number) => number;
    readonly register_emoji_font: (a: number, b: number) => number;
    readonly register_script_font: (a: number, b: number, c: number, d: number) => number;
    readonly register_symbol_fonts: (a: number, b: number, c: number, d: number) => number;
    readonly register_ua_fonts: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly rulestyledeclarationstore_cascadeText: (a: number) => [number, number];
    readonly rulestyledeclarationstore_cssText: (a: number) => [number, number];
    readonly rulestyledeclarationstore_getPropertyPriority: (a: number, b: number, c: number) => [number, number];
    readonly rulestyledeclarationstore_getPropertyValue: (a: number, b: number, c: number) => [number, number];
    readonly rulestyledeclarationstore_hasProperty: (a: number, b: number, c: number) => number;
    readonly rulestyledeclarationstore_item: (a: number, b: number) => [number, number];
    readonly rulestyledeclarationstore_length: (a: number) => number;
    readonly rulestyledeclarationstore_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly rulestyledeclarationstore_removeProperty: (a: number, b: number, c: number) => [number, number];
    readonly rulestyledeclarationstore_setCssText: (a: number, b: number, c: number) => void;
    readonly rulestyledeclarationstore_setProperty: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly sceneToAnsi: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
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
    readonly setDarkColorScheme: (a: number) => void;
    readonly setDimsOnlyImages: (a: number) => void;
    readonly setFontShapingLazy: (a: number) => void;
    readonly setPixelFreeSession: (a: number) => void;
    readonly setTtyUaCss: (a: number, b: number) => void;
    readonly set_ks_trace_parent: (a: number, b: number) => void;
    readonly set_ks_tracing: (a: number) => void;
    readonly start: () => void;
    readonly stripFontForShaping: (a: number, b: number) => [number, number];
    readonly ttyrenderer_abandonImage: (a: number, b: number, c: number) => number;
    readonly ttyrenderer_cellCollisions: (a: number) => number;
    readonly ttyrenderer_imagesMissing: (a: number) => number;
    readonly ttyrenderer_imagesPlaced: (a: number) => number;
    readonly ttyrenderer_missingImages: (a: number, b: number, c: number) => [number, number];
    readonly ttyrenderer_new: () => number;
    readonly ttyrenderer_pendingImages: (a: number) => [number, number];
    readonly ttyrenderer_placementCount: (a: number) => number;
    readonly ttyrenderer_placementMeta: (a: number) => [number, number];
    readonly ttyrenderer_placementPng: (a: number, b: number) => [number, number];
    readonly ttyrenderer_putImageBytes: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly ttyrenderer_putResources: (a: number, b: number, c: number) => number;
    readonly ttyrenderer_sceneToAnsi: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly ttyrenderer_setImageMode: (a: number, b: number, c: number) => void;
    readonly upgradeAuthorFontFace: (a: number, b: number, c: number, d: number) => number;
    readonly upgradeFontFace: (a: number, b: number, c: number, d: number) => number;
    readonly setTtyCellGrid: (a: number, b: number) => void;
    readonly pressoutcome_redraw: (a: number) => number;
    readonly pressoutcome_hit: (a: number) => [number, number];
    readonly __wbg_pressoutcome_free: (a: number, b: number) => void;
    readonly Servo_NumericType_MatchesAngle: (a: number) => number;
    readonly Servo_NumericType_MatchesLength: (a: number) => number;
    readonly Servo_NumericType_MatchesLengthPercentage: (a: number) => number;
    readonly Servo_NumericType_MatchesNumber: (a: number) => number;
    readonly Servo_NumericType_MatchesPercentage: (a: number) => number;
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___f64__f64__wasm_bindgen_f81e67adadebf875___JsValue__core_4c84e96e5ce50ebd___result__Result_wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue___true_: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___f64__wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__core_4c84e96e5ce50ebd___result__Result_wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue___true_: (a: number, b: number, c: number, d: any, e: any) => [number, number, number];
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___f64__wasm_bindgen_f81e67adadebf875___JsValue__core_4c84e96e5ce50ebd___result__Result_wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue___true_: (a: number, b: number, c: number, d: any) => [number, number, number];
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__true_: (a: number, b: number, c: any, d: any, e: any, f: any) => any;
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__true_: (a: number, b: number, c: any, d: any, e: any) => any;
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__true_: (a: number, b: number, c: any, d: any) => any;
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___wasm_bindgen_f81e67adadebf875___JsValue__core_4c84e96e5ce50ebd___result__Result_____wasm_bindgen_f81e67adadebf875___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___js_sys_c7d339b021832132___Function_fn_wasm_bindgen_f81e67adadebf875___JsValue_____wasm_bindgen_f81e67adadebf875___sys__Undefined___js_sys_c7d339b021832132___Function_fn_wasm_bindgen_f81e67adadebf875___JsValue_____wasm_bindgen_f81e67adadebf875___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___wasm_bindgen_f81e67adadebf875___JsValue__wasm_bindgen_f81e67adadebf875___JsValue__true_: (a: number, b: number, c: any) => any;
    readonly wasm_bindgen_f81e67adadebf875___convert__closures_____invoke___wasm_bindgen_f81e67adadebf875___JsValue______true_: (a: number, b: number, c: any) => void;
    readonly __wbindgen_export: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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

// HIDDEN-BRIDGE-MARKER-v1 — appended by build-wasm.mjs.
// Bootstrap path calls this once, before initSync(wasm), with
// the JS-side implementation of the wasm → JS fetchResource
// bridge. See packages/core/src/resources/net.rs + the rationale in
// the post-pass block in scripts/build-wasm.mjs.
export declare function __setBridgeFetchResource(
  fn: (request_id: number, url: string, kind: string) => void,
): void;
