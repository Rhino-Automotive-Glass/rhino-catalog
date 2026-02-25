import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";

/**
 * POST /api/upload
 *
 * Accepts a file via FormData, uploads it to Vercel Blob, returns the public URL.
 * Query params:
 *   folder – optional path prefix (e.g. "ABC123/left-main")
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Build a path: products/{folder}/{filename}
  const folder = req.nextUrl.searchParams.get("folder") ?? "misc";
  const pathname = `products/${folder}/${file.name}`;

  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return NextResponse.json({ url: blob.url, pathname: blob.pathname });
}

/**
 * DELETE /api/upload
 *
 * Deletes a blob by its URL.
 */
export async function DELETE(req: NextRequest) {
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  await del(url);
  return NextResponse.json({ success: true });
}
