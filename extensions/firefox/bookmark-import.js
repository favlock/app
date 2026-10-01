import { hasFirefoxBookmarkPermission } from "./extension-permissions.js";

export async function readFirefoxBookmarks(message, sender) {
  if (message?.type !== "favlock.firefox.bookmarks.read" ||
      sender.id !== browser.runtime.id ||
      sender.url !== browser.runtime.getURL("bookmark-import-bridge.html")) {
    return { ok: false, error: "Untrusted bookmark import request." };
  }
  if (!(await hasFirefoxBookmarkPermission(browser.permissions))) {
    return { ok: false, error: "Allow Firefox bookmark access from FavLock extension settings, then try the import again." };
  }
  const tree = await browser.bookmarks.getTree();
  const pending = [...tree];
  let count = 0;
  while (pending.length) {
    if (++count > 100_000) throw new Error("Firefox returned too many bookmark entries to import safely.");
    const node = pending.pop();
    if (node.children) {
      for (const child of node.children) pending.push(child);
    }
  }
  return { ok: true, tree };
}
