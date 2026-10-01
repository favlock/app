import type { BrowserBookmarkImportItem, BrowserBookmarkImportResult } from "./browserBookmarkImport";

export function parseFirefoxBookmarksTree(
  value: unknown,
): BrowserBookmarkImportResult {
  if (!Array.isArray(value)) {
    return { bookmarks: [], folderPaths: [] };
  }

  const bookmarks: BrowserBookmarkImportItem[] = [];
  const folderMap = new Map<string, string[]>();
  const pending = value
    .map((node) => ({ node, parentPath: [] as string[] }))
    .reverse();
  let visitedNodes = 0;

  while (pending.length > 0) {
    visitedNodes += 1;
    if (visitedNodes > 100_000) {
      throw new Error(
        "Firefox returned too many bookmark entries to import safely.",
      );
    }

    const current = pending.pop();
    if (!current || typeof current.node !== "object" || current.node === null) {
      continue;
    }

    const node = current.node as Record<string, unknown>;
    if (node.type === "separator") continue;
    const title = typeof node.title === "string" ? node.title.trim() : "";
    const url = typeof node.url === "string" ? node.url.trim() : "";

    if (url) {
      bookmarks.push({ title, url, folderPath: current.parentPath });
      continue;
    }

    const folderPath = title
      ? [...current.parentPath, title]
      : current.parentPath;
    if (title) {
      folderMap.set(JSON.stringify(folderPath), folderPath);
    }

    if (!Array.isArray(node.children)) continue;

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push({ node: node.children[index], parentPath: folderPath });
    }
  }

  return { bookmarks, folderPaths: Array.from(folderMap.values()) };
}

export function getFirefoxExtensionOrigin(search: string): string | null {
  const value = new URLSearchParams(search).get("firefoxExtensionOrigin");
  if (!value || !/^moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(value)) return null;
  return value.replace(/\/$/, "");
}
