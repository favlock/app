const CHROME_BOOKMARK_PERMISSION = "bookmarks";

export function getHighlightSitePattern(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return `${url.origin}/*`;
  } catch {
    return null;
  }
}

export async function requestHighlightSiteAccess(permissionsApi, url) {
  const pattern = getHighlightSitePattern(url);
  if (!pattern) return false;
  return permissionsApi.request({ origins: [pattern] });
}

export async function hasHighlightSiteAccess(permissionsApi, url) {
  const pattern = getHighlightSitePattern(url);
  if (!pattern) return false;
  return permissionsApi.contains({ origins: [pattern] });
}

export async function removeGrantedHighlightSiteAccess(
  permissionsApi,
  protectedOrigins = [],
) {
  const granted = await permissionsApi.getAll();
  const protectedSet = new Set(protectedOrigins);
  const removableOrigins = (granted.origins || []).filter(
    (origin) => /^https?:\/\//i.test(origin) && !protectedSet.has(origin),
  );
  let removed = 0;
  for (const origin of removableOrigins) {
    if (await permissionsApi.remove({ origins: [origin] })) removed += 1;
  }
  return removed;
}

export async function requestChromeBookmarkPermission(permissionsApi) {
  return permissionsApi.request({
    permissions: [CHROME_BOOKMARK_PERMISSION],
  });
}

export async function hasChromeBookmarkPermission(permissionsApi) {
  return permissionsApi.contains({
    permissions: [CHROME_BOOKMARK_PERMISSION],
  });
}
