import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { getUserRole, canEditImages } from "@/lib/roles";
import { apiFailure } from "@/lib/api-error-response";

export const runtime = "nodejs";

const LOCAL_UPLOAD_PREFIX = "/uploads/products";

function sanitizePathPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "upload";
}

function sanitizeFolder(folder: string): string {
  return folder
    .split("/")
    .map(sanitizePathPart)
    .filter(Boolean)
    .join("/");
}

function localUploadEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * POST /api/upload
 *
 * Accepts a file via FormData, uploads it to Vercel Blob, returns the public URL.
 * Requires at least editor role.
 * Query params:
 *   folder – optional path prefix (e.g. "ABC123/left-main")
 */
export async function POST(req: NextRequest) {
  const userRole = await getUserRole();
  if (!userRole || !canEditImages(userRole.role)) {
    return NextResponse.json(
      {
        error: "Not authorized to upload images",
        userMessage: "You do not have permission to upload product images.",
      },
      { status: 403 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Build a path: products/{folder}/{filename}
    const folder = sanitizeFolder(req.nextUrl.searchParams.get("folder") ?? "misc");
    const filename = sanitizePathPart(file.name);
    const pathname = `products/${folder}/${filename}`;

    if (!process.env.BLOB_READ_WRITE_TOKEN && localUploadEnabled()) {
      const fileExtension = filename.includes(".")
        ? filename.slice(filename.lastIndexOf("."))
        : "";
      const filenameBase = filename.replace(/\.[^.]+$/, "");
      const localFilename = `${filenameBase}-${crypto.randomUUID()}${fileExtension}`;
      const uploadDirectory = join(process.cwd(), "public", LOCAL_UPLOAD_PREFIX, folder);
      const publicPath = `${LOCAL_UPLOAD_PREFIX}/${folder}/${localFilename}`;

      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(
        join(uploadDirectory, localFilename),
        Buffer.from(await file.arrayBuffer())
      );

      return NextResponse.json({
        url: publicPath,
        pathname: publicPath,
        storage: "local",
      });
    }

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname, storage: "blob" });
  } catch (error) {
    return apiFailure({
      context: "POST /api/upload failed",
      error,
      userMessage:
        "The image upload failed. Please try again with a smaller image or contact support with the debug ID.",
    });
  }
}

/**
 * DELETE /api/upload
 *
 * Deletes a blob by its URL.
 * Requires at least editor role.
 */
export async function DELETE(req: NextRequest) {
  const userRole = await getUserRole();
  if (!userRole || !canEditImages(userRole.role)) {
    return NextResponse.json(
      {
        error: "Not authorized to delete images",
        userMessage: "You do not have permission to delete product images.",
      },
      { status: 403 }
    );
  }

  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  }

  if (
    typeof url === "string" &&
    url.startsWith(`${LOCAL_UPLOAD_PREFIX}/`) &&
    localUploadEnabled()
  ) {
    const localPath = join(process.cwd(), "public", url);
    await unlink(localPath).catch(() => {});
    return NextResponse.json({ success: true });
  }

  // In local dev without a blob token we cannot (and should not) delete
  // remote production blobs. Mirror the POST local fallback and no-op so
  // image cleanup after a delete doesn't fail. Production keeps the token
  // and performs the real deletion below.
  if (!process.env.BLOB_READ_WRITE_TOKEN && localUploadEnabled()) {
    console.warn(
      `Skipping remote blob deletion (no BLOB_READ_WRITE_TOKEN in local dev): ${url}`
    );
    return NextResponse.json({ success: true, storage: "skipped" });
  }

  try {
    await del(url);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiFailure({
      context: "DELETE /api/upload failed",
      error,
      userMessage:
        "The image could not be deleted from storage. The product may still be saved, but the old image may need manual cleanup.",
      log: { url },
    });
  }
}
