// A leading "name:" is a URL scheme unless it is a host followed by a port, as
// in "localhost:3000" or "example.com:8080/path".
const EXPLICIT_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i;

export function normalizeImportedBookmarkUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const hasWebScheme = /^https?:\/\//i.test(trimmed);
  if (!hasWebScheme && EXPLICIT_SCHEME_PATTERN.test(trimmed)) return null;
  const normalized = hasWebScheme ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const TRACKING_PARAMETER_NAMES = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "twclid",
]);

export function isTrackingParameter(name: string): boolean {
  const normalizedName = name.toLowerCase();
  return (
    normalizedName.startsWith("utm_") ||
    TRACKING_PARAMETER_NAMES.has(normalizedName)
  );
}

export function normalizeBookmarkUrlForLinkCheck(
  rawUrl: string,
): string | null {
  const normalizedUrl = normalizeImportedBookmarkUrl(rawUrl);
  if (!normalizedUrl) return null;

  const url = new URL(normalizedUrl);
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (isTrackingParameter(name)) url.searchParams.delete(name);
  }
  return url.toString();
}
