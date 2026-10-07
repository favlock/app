import type { Folder, Tag } from "../types/bookmark";

export const SIDEBAR_SEARCH_THRESHOLD = 10;

export interface SidebarFolderRow {
  folder: Folder;
  /** Shown only so a matching subcollection keeps its parent visible. */
  isContext: boolean;
}

export interface LimitedSidebarItems<T> {
  visible: T[];
  hiddenCount: number;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(query: string): string[] {
  return normalize(query).split(" ").filter(Boolean);
}

function matchesTerms(name: string, terms: string[]): boolean {
  const normalizedName = normalize(name);
  return terms.every((term) => normalizedName.includes(term));
}

export function hasSidebarQuery(query: string): boolean {
  return queryTerms(query).length > 0;
}

/** Expects folders in sidebar order, with each parent before its children. */
export function filterSidebarFolders(
  folders: Folder[],
  query: string,
): SidebarFolderRow[] {
  const terms = queryTerms(query);
  if (terms.length === 0) {
    return folders.map((folder) => ({ folder, isContext: false }));
  }

  const matchingIds = new Set(
    folders
      .filter((folder) => matchesTerms(folder.name, terms))
      .map((folder) => folder.id),
  );
  const contextIds = new Set(
    folders
      .filter((folder) => matchingIds.has(folder.id) && folder.parent_id)
      .map((folder) => folder.parent_id as string)
      .filter((parentId) => !matchingIds.has(parentId)),
  );

  return folders
    .filter((folder) => matchingIds.has(folder.id) || contextIds.has(folder.id))
    .map((folder) => ({ folder, isContext: contextIds.has(folder.id) }));
}

export function filterSidebarTags(tags: Tag[], query: string): Tag[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return tags;
  return tags.filter((tag) => matchesTerms(tag.name, terms));
}

/**
 * Shows at most `limit` items. Items listed in `keepIds` always stay visible
 * and take the last slots, so the current selection never disappears behind
 * "Show more". Never hides a single item: showing it takes no more space than
 * a "Show 1 more" button.
 */
export function limitSidebarItems<T>(
  items: T[],
  getId: (item: T) => string,
  limit: number,
  keepIds: ReadonlySet<string> = new Set(),
): LimitedSidebarItems<T> {
  const keptIndexes = items.flatMap((item, index) =>
    keepIds.has(getId(item)) ? [index] : [],
  );
  let headSize = limit;
  while (
    headSize > 0 &&
    headSize + keptIndexes.filter((index) => index >= headSize).length > limit
  ) {
    headSize -= 1;
  }

  const visible = items.filter(
    (item, index) => index < headSize || keepIds.has(getId(item)),
  );
  const hiddenCount = items.length - visible.length;
  return hiddenCount > 1
    ? { visible, hiddenCount }
    : { visible: items, hiddenCount: 0 };
}

/** The selected collection and, for a subcollection, its parent. */
export function selectedFolderKeepIds(
  folders: Folder[],
  selectedFolderId: string | null | undefined,
): Set<string> {
  const selected = folders.find((folder) => folder.id === selectedFolderId);
  if (!selected) return new Set();
  return new Set(
    selected.parent_id ? [selected.id, selected.parent_id] : [selected.id],
  );
}
