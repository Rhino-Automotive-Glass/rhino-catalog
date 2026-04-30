import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { isCatalogBlobUrl } from "@/lib/catalog-image";

const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";
const fallbackImagePromise = readFile(join(process.cwd(), "public", "rhino-logo.png"));

async function getFallbackResponse() {
  const fallbackImage = await fallbackImagePromise;

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
