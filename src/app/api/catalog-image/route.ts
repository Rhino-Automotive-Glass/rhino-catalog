import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { isCatalogBlobUrl } from "@/lib/catalog-image";

const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

/**
 * 1x1 transparent PNG, used when the logo on disk cannot be read.
 *
 * `public/` is not guaranteed to be present in the traced serverless bundle, so
 * the route must still answer with a valid image rather than throwing — an
 * <img> that 500s is worse than a blank pixel.
 */
const TRANSPARENT_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

let fallbackImagePromise: Promise<Buffer> | null = null;

function loadFallbackImage(): Promise<Buffer> {
  if (!fallbackImagePromise) {
    // Read lazily: a rejection at module scope would be an unhandled rejection
    // at import time. Failures are not cached, so a later request can retry.
    fallbackImagePromise = readFile(
      join(process.cwd(), "public", "rhino-logo.png")
    ).catch((error: unknown) => {
      fallbackImagePromise = null;
      throw error;
    });
  }

  return fallbackImagePromise;
}

async function getFallbackResponse() {
  let fallbackImage: Buffer;

  try {
    fallbackImage = await loadFallbackImage();
  } catch (error) {
    console.error("GET /api/catalog-image fallback image unavailable", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    fallbackImage = TRANSPARENT_PIXEL;
  }

  return new NextResponse(new Uint8Array(fallbackImage), {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": "image/png",
    },
  });
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");

  if (!src || !isCatalogBlobUrl(src)) {
    return getFallbackResponse();
  }

  try {
    const upstream = await fetch(src, {
      cache: "force-cache",
      next: { revalidate: 3600 },
    });

    if (!upstream.ok || !upstream.body) {
      return getFallbackResponse();
    }

    const headers = new Headers();
    headers.set(
      "Cache-Control",
      upstream.headers.get("cache-control") ?? CACHE_CONTROL
    );
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") ?? "image/png"
    );

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new NextResponse(upstream.body, {
      headers,
      status: 200,
    });
  } catch {
    return getFallbackResponse();
  }
}
