const CHROME_BOOKMARK_PERMISSION = "bookmarks";

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
