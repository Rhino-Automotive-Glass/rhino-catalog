/**
 * @param {{
 *   secFetchSite: string | null,
 *   origin: string | null,
 *   host: string | null,
 *   forwardedProto: string | null,
 *   fallbackProtocol: string,
 * }} headers
 */
export function isCrossSiteRequestHeaders(headers) {
  if (
    headers.secFetchSite &&
    headers.secFetchSite !== "same-origin" &&
    headers.secFetchSite !== "none"
  ) {
    return true;
  }

  if (!headers.origin) return false;
  if (!headers.host) return true;

  const protocol = (headers.forwardedProto?.split(",")[0] ?? headers.fallbackProtocol)
    .trim()
    .replace(/:$/, "");

  if (protocol !== "http" && protocol !== "https") return true;

  try {
    const requestOrigin = new URL(`${protocol}://${headers.host}`).origin;
    return new URL(headers.origin).origin !== requestOrigin;
  } catch {
    return true;
  }
}
