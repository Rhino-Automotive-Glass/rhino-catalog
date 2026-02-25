/**
 * Upload a file to Vercel Blob via our /api/upload endpoint.
 * Returns the public URL.
 */
export async function uploadImage(
  file: File,
  folder: string
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`/api/upload?folder=${encodeURIComponent(folder)}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Upload failed");
  }

  const { url } = await res.json();
  return url;
}

/** Delete an image from Vercel Blob */
export async function deleteImage(url: string): Promise<void> {
  const res = await fetch("/api/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Delete failed");
  }
}
