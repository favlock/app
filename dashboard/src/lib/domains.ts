const SECOND_LEVEL_DOMAIN_PARTS = new Set([
  "co",
  "com",
  "net",
  "org",
  "gov",
  "ac",
  "edu",
]);

function stripLeadingWww(hostname: string): string {
  return hostname.replace(/^www\./, "");
}

function parseBookmarkUrl(url: string): URL {
  return new URL(
    /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`,
  );
}

function isIpAddress(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const value = Number(part);
      return value >= 0 && value <= 255;
    })
  );
}

export function getMainDomain(url: string): string {
  try {
    const hostname = stripLeadingWww(
      parseBookmarkUrl(url).hostname.toLowerCase(),
    );
    if (!hostname || isIpAddress(hostname)) return hostname;

    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) return parts.join(".");

    const hasCommonSecondLevelSuffix =
      parts.at(-1)?.length === 2 &&
      SECOND_LEVEL_DOMAIN_PARTS.has(parts.at(-2) ?? "");
    return parts.slice(hasCommonSecondLevelSuffix ? -3 : -2).join(".");
  } catch {
    return url;
  }
}
