const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function isCatalogBlobUrl(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

export function getCatalogImageSrc(src?: string | null): string {
  if (!src) {
    return "/rhino-logo.png";
  }

  if (src.startsWith("/")) {
    return src;
  }

  return isCatalogBlobUrl(src)
    ? `/api/catalog-image?src=${encodeURIComponent(src)}`
    : "/rhino-logo.png";
}
