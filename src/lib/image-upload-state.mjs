/**
 * @param {string[]} currentUrls
 * @param {string} uploadedUrl
 * @param {number} max
 * @returns {
 *   | { accepted: false, urls: string[], rejectedUrl: string }
 *   | { accepted: true, urls: string[], rejectedUrl: null }
 * }
 */
export function commitUploadedImage(currentUrls, uploadedUrl, max) {
  if (currentUrls.length >= max) {
    return {
      accepted: false,
      urls: currentUrls,
      rejectedUrl: uploadedUrl,
    };
  }

  return {
    accepted: true,
    urls: [...currentUrls, uploadedUrl],
    rejectedUrl: null,
  };
}

/**
 * @param {string[]} currentUrls
 * @param {number} index
 * @returns {{ removedUrl: string, urls: string[] } | null}
 */
export function removeImageAt(currentUrls, index) {
  const removedUrl = currentUrls[index];

  if (!removedUrl) return null;

  return {
    removedUrl,
    urls: currentUrls.filter((_, currentIndex) => currentIndex !== index),
  };
}
