/**
 * Serves `/fonts/*` assets for Kitesurf's `env.FONT_ASSETS` Fetcher binding.
 */

export type FontLoaderFn = (filename: string) => Promise<Uint8Array | null>;

export interface FontAssetsFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

function contentTypeForFont(name: string): string {
  if (name.endsWith(".otf")) return "font/otf";
  if (name.endsWith(".ttf")) return "font/ttf";
  if (name.endsWith(".woff2")) return "font/woff2";
  if (name.endsWith(".woff")) return "font/woff";
  if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export function createFontAssetsFetcher(loadFont: FontLoaderFn): FontAssetsFetcher {
  const cache = new Map<string, Uint8Array | null>();

  return {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      let pathname: string;
      try {
        pathname = new URL(urlStr).pathname;
      } catch {
        pathname = urlStr;
      }
      if (!pathname.startsWith("/fonts/") || pathname.includes("..")) {
        return new Response("Not found", { status: 404 });
      }
      const filename = pathname.slice("/fonts/".length);
      if (!filename || filename.includes("/")) {
        return new Response("Not found", { status: 404 });
      }

      let bytes = cache.get(filename);
      if (bytes === undefined) {
        bytes = await loadFont(filename);
        cache.set(filename, bytes);
      }
      if (!bytes) {
        return new Response("Not found", { status: 404 });
      }
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return new Response(copy.buffer, {
        status: 200,
        headers: {
          "content-type": contentTypeForFont(filename),
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    },
  };
}
