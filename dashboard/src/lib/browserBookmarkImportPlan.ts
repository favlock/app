import {
  getRemainingResourceLimit,
  type PlanDefinition,
} from "@favlock/shared";
import type { Bookmark, Folder } from "../types/bookmark";
import {
  folderPathKey,
  getExistingFolderIdByPath,
  getImportFolderPaths,
  getImportedBookmarkTitle,
  normalizeImportedBookmarkUrl,
  toSupportedFolderPath,
  type BrowserBookmarkImportResult,
} from "./browserBookmarkImport";

export type PreparedBrowserBookmarkImportItem = {
  index: number;
  title: string;
  url: string;
  folderPath: string[];
  duplicate: "source" | "library" | null;
  existingBookmark: Bookmark | null;
};

export type InvalidBrowserBookmarkImportItem = {
  index: number;
  title: string;
  url: string;
  folderPath: string[];
  reason: "Unsupported or invalid URL";
};

export type BrowserBookmarkImportPreview = {
  fingerprint: string;
  items: PreparedBrowserBookmarkImportItem[];
  invalidItems: InvalidBrowserBookmarkImportItem[];
  folderPaths: string[][];
  newFolderPaths: string[][];
  totalCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  sourceDuplicateCount: number;
  libraryDuplicateCount: number;
  readyToAddCount: number;
  bookmarkLimit: number;
  bookmarkUsage: number;
  availableBookmarks: number | null;
  collectionLimit: number;
  collectionUsage: number;
  availableCollections: number | null;
  blockedReason: string | null;
};

type ResourceUsage = { bookmarks: number; collections: number };

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintBrowserBookmarkImport(
  result: BrowserBookmarkImportResult,
): Promise<string> {
  const canonical = JSON.stringify({
    bookmarks: result.bookmarks.map(({ title, url, folderPath }) => ({
      title,
      url,
      folderPath,
    })),
    folderPaths: result.folderPaths,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return bytesToHex(digest);
}

export async function prepareBrowserBookmarkImport(
  result: BrowserBookmarkImportResult,
  existingBookmarks: Bookmark[],
  existingFolders: Folder[],
  plan: Pick<PlanDefinition, "limits">,
  usage: ResourceUsage,
): Promise<BrowserBookmarkImportPreview> {
  const existingByUrl = new Map<string, Bookmark>();
  for (const bookmark of existingBookmarks) {
    const normalized = normalizeImportedBookmarkUrl(bookmark.url);
    if (normalized && !existingByUrl.has(normalized)) {
      existingByUrl.set(normalized, bookmark);
    }
  }

  const sourceUrls = new Set<string>();
  const items: PreparedBrowserBookmarkImportItem[] = [];
  const invalidItems: InvalidBrowserBookmarkImportItem[] = [];
  let sourceDuplicateCount = 0;
  let libraryDuplicateCount = 0;

  result.bookmarks.forEach((item, index) => {
    const url = normalizeImportedBookmarkUrl(item.url);
    if (!url) {
      invalidItems.push({
        index,
        title: item.title.trim() || "Untitled bookmark",
        url: item.url.trim() || "Missing URL",
        folderPath: toSupportedFolderPath(item.folderPath),
        reason: "Unsupported or invalid URL",
      });
      return;
    }

    const folderPath = toSupportedFolderPath(item.folderPath);
    const sourceDuplicate = sourceUrls.has(url);
    sourceUrls.add(url);
    const existingBookmark = existingByUrl.get(url) ?? null;
    const duplicate = sourceDuplicate
      ? "source"
      : existingBookmark
        ? "library"
        : null;
    if (duplicate === "source") sourceDuplicateCount += 1;
    if (duplicate === "library") libraryDuplicateCount += 1;

    items.push({
      index,
      title: getImportedBookmarkTitle(item.title, url),
      url,
      folderPath,
      duplicate,
      existingBookmark,
    });
  });

  const folderPaths = getImportFolderPaths([
    ...result.folderPaths,
    ...items.map((item) => item.folderPath),
  ]);
  const existingFolderMap = getExistingFolderIdByPath(existingFolders);
  const newFolderPaths = folderPaths.filter(
    (path) => !existingFolderMap.has(folderPathKey(path)),
  );
  const readyToAddCount = items.filter((item) => item.duplicate === null).length;
  const availableBookmarks = getRemainingResourceLimit(
    usage.bookmarks,
    plan.limits.bookmarks,
  );
  const availableCollections =
    plan.limits.collections === 0
      ? null
      : Math.max(0, plan.limits.collections - usage.collections);
  let blockedReason: string | null = null;
  if (availableBookmarks !== null && readyToAddCount > availableBookmarks) {
    blockedReason = `This import needs space for at least ${readyToAddCount} new bookmarks, but your current plan has ${availableBookmarks} remaining.`;
  } else if (
    availableCollections !== null &&
    newFolderPaths.length > availableCollections
  ) {
    blockedReason = `This import needs ${newFolderPaths.length} new collections, but your current plan has ${availableCollections} remaining.`;
  }

  return {
    fingerprint: await fingerprintBrowserBookmarkImport(result),
    items,
    invalidItems,
    folderPaths,
    newFolderPaths,
    totalCount: result.bookmarks.length,
    validCount: items.length,
    invalidCount: invalidItems.length,
    duplicateCount: sourceDuplicateCount + libraryDuplicateCount,
    sourceDuplicateCount,
    libraryDuplicateCount,
    readyToAddCount,
    bookmarkLimit: plan.limits.bookmarks,
    bookmarkUsage: usage.bookmarks,
    availableBookmarks,
    collectionLimit: plan.limits.collections,
    collectionUsage: usage.collections,
    availableCollections,
    blockedReason,
  };
}
