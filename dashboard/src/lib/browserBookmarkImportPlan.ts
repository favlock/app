import {
  getRemainingResourceLimit,
  type PlanDefinition,
} from "@favlock/shared";
import type { Bookmark, Folder, Tag } from "../types/bookmark";
import { normalizeTagName } from "./bookmarkWrites";
import {
  folderPathKey,
  getExistingFolderIdByPath,
  getImportFolderPaths,
  getImportedBookmarkTitle,
  normalizeImportedBookmarkUrl,
  toSupportedFolderPath,
  type BrowserBookmarkImportResult,
} from "./browserBookmarkImport";

export const IMPORT_TAGS_PER_BOOKMARK = 10;
export const IMPORT_TAG_NAME_MAX_LENGTH = 200;

export type PreparedBrowserBookmarkImportItem = {
  index: number;
  title: string;
  url: string;
  folderPath: string[];
  tags: string[];
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
  tagNames: string[];
  newTagNames: string[];
  taggedCount: number;
  skippedTagCount: number;
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
  availableTags: number | null;
  blockedReason: string | null;
};

type ResourceUsage = { bookmarks: number; collections: number; tags?: number };

export function getImportTagKey(name: string): string {
  return normalizeTagName(name);
}

function prepareItemTags(tags: string[] | undefined): {
  tags: string[];
  skipped: number;
} {
  const source = tags ?? [];
  const unique = [...new Set(source.map(normalizeTagName).filter(Boolean))];
  const valid = unique.filter((tag) => tag.length <= IMPORT_TAG_NAME_MAX_LENGTH);
  const kept = valid.slice(0, IMPORT_TAGS_PER_BOOKMARK);
  return {
    tags: kept,
    skipped: unique.length - kept.length,
  };
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintBrowserBookmarkImport(
  result: BrowserBookmarkImportResult,
): Promise<string> {
  const canonical = JSON.stringify({
    bookmarks: result.bookmarks.map(({ title, url, folderPath, tags }) => ({
      title,
      url,
      folderPath,
      ...(tags?.length ? { tags } : {}),
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
  existingTags: Tag[],
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
  let skippedTagCount = 0;

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
    const preparedTags = prepareItemTags(item.tags);
    skippedTagCount += preparedTags.skipped;
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
      tags: preparedTags.tags,
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
  const tagNames = [...new Set(
    items.filter((item) => item.duplicate !== "source").flatMap((item) => item.tags),
  )];
  const existingTagNames = new Set(existingTags.map((tag) => getImportTagKey(tag.name)));
  const newTagNames = tagNames.filter((name) => !existingTagNames.has(name));
  const taggedCount = items.filter((item) => item.tags.length > 0).length;
  const readyToAddCount = items.filter((item) => item.duplicate === null).length;
  const availableBookmarks = getRemainingResourceLimit(
    usage.bookmarks,
    plan.limits.bookmarks,
  );
  const availableCollections =
    plan.limits.collections === 0
      ? null
      : Math.max(0, plan.limits.collections - usage.collections);
  const availableTags = getRemainingResourceLimit(
    usage.tags ?? existingTags.length,
    plan.limits.tags,
  );
  let blockedReason: string | null = null;
  if (availableBookmarks !== null && readyToAddCount > availableBookmarks) {
    blockedReason = `This import needs space for at least ${readyToAddCount} new bookmarks, but your current plan has ${availableBookmarks} remaining.`;
  } else if (
    availableCollections !== null &&
    newFolderPaths.length > availableCollections
  ) {
    blockedReason = `This import needs ${newFolderPaths.length} new collections, but your current plan has ${availableCollections} remaining.`;
  } else if (availableTags !== null && newTagNames.length > availableTags) {
    blockedReason = `This import needs ${newTagNames.length} new tags, but your current plan has ${availableTags} remaining.`;
  }

  return {
    fingerprint: await fingerprintBrowserBookmarkImport(result),
    items,
    invalidItems,
    folderPaths,
    newFolderPaths,
    tagNames,
    newTagNames,
    taggedCount,
    skippedTagCount,
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
    availableTags,
    blockedReason,
  };
}

export function describeImportTags(
  preview: Pick<BrowserBookmarkImportPreview, "taggedCount" | "newTagNames" | "skippedTagCount">,
): string {
  if (preview.taggedCount === 0 && preview.skippedTagCount === 0) return "";
  const parts = [
    `${preview.taggedCount} record${preview.taggedCount === 1 ? " has" : "s have"} tags; ${preview.newTagNames.length} new tag${preview.newTagNames.length === 1 ? "" : "s"} will be created.`,
  ];
  if (preview.skippedTagCount > 0) {
    parts.push(
      `${preview.skippedTagCount} tag${preview.skippedTagCount === 1 ? " was" : "s were"} skipped because a bookmark can have at most ${IMPORT_TAGS_PER_BOOKMARK} tags of up to ${IMPORT_TAG_NAME_MAX_LENGTH} characters.`,
    );
  }
  return parts.join(" ");
}
