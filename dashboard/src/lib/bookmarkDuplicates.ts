import {
  isTrackingParameter,
  normalizeImportedBookmarkUrl,
} from "./bookmarkUrl";

export type DuplicateMatchMode = "exact" | "tracking" | "query";

export interface DuplicateBookmarkCandidate {
  id: string;
  title: string;
  url: string;
  created_at: string;
}

export interface BookmarkDuplicateGroup {
  normalizedUrl: string;
  keeper: DuplicateBookmarkCandidate;
  duplicates: DuplicateBookmarkCandidate[];
  matchNote: string;
}

interface MatchKey {
  url: string;
  ignoredFragment: boolean;
  ignoredQuery: boolean;
  ignoredTrackingParameters: string[];
}

type IndexedBookmark = {
  bookmark: DuplicateBookmarkCandidate;
  key: MatchKey;
};

function getMatchKey(rawUrl: string, mode: DuplicateMatchMode): MatchKey | null {
  const normalizedUrl = normalizeImportedBookmarkUrl(rawUrl);
  if (!normalizedUrl) return null;

  const url = new URL(normalizedUrl);
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  const ignoredFragment = mode !== "exact" && Boolean(url.hash);
  const ignoredTrackingParameters: string[] = [];
  let ignoredQuery = false;

  if (mode === "query") {
    ignoredQuery = Boolean(url.search);
    url.search = "";
  } else if (mode === "tracking") {
    for (const name of [...url.searchParams.keys()]) {
      if (!isTrackingParameter(name)) continue;
      ignoredTrackingParameters.push(name);
      url.searchParams.delete(name);
    }
  }

  if (mode !== "exact") url.hash = "";

  return {
    url: url.toString(),
    ignoredFragment,
    ignoredQuery,
    ignoredTrackingParameters,
  };
}

function describeMatch(keys: MatchKey[], mode: DuplicateMatchMode): string {
  if (mode === "exact") return "Exact URL match.";

  const ignoredParameters = [
    ...new Set(keys.flatMap((key) => key.ignoredTrackingParameters)),
  ].sort();
  const ignoredQuery = keys.some((key) => key.ignoredQuery);
  const ignoredFragment = keys.some((key) => key.ignoredFragment);
  const reasons: string[] = [];

  if (ignoredQuery) reasons.push("query parameters");
  else if (ignoredParameters.length > 0) {
    reasons.push(`tracking parameters (${ignoredParameters.join(", ")})`);
  }
  if (ignoredFragment) reasons.push("page sections");

  return reasons.length > 0
    ? `Matched after ignoring ${reasons.join(" and ")}.`
    : "Same normalized URL.";
}

function compareBookmarksByAge(
  left: DuplicateBookmarkCandidate,
  right: DuplicateBookmarkCandidate,
): number {
  const createdAtDifference =
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime();

  return createdAtDifference || left.id.localeCompare(right.id);
}

function addBookmarkToIndex(
  bookmarksByUrl: Map<string, IndexedBookmark[]>,
  bookmark: DuplicateBookmarkCandidate,
  mode: DuplicateMatchMode,
): void {
  const key = getMatchKey(bookmark.url, mode);
  if (!key) return;

  const matches = bookmarksByUrl.get(key.url) ?? [];
  matches.push({ bookmark, key });
  bookmarksByUrl.set(key.url, matches);
}

function groupsFromIndex(
  bookmarksByUrl: Map<string, IndexedBookmark[]>,
  mode: DuplicateMatchMode,
): BookmarkDuplicateGroup[] {
  return [...bookmarksByUrl.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([normalizedUrl, matches]) => {
      const sortedMatches = matches
        .map(({ bookmark }) => bookmark)
        .sort(compareBookmarksByAge);
      return {
        normalizedUrl,
        keeper: sortedMatches[0],
        duplicates: sortedMatches.slice(1),
        matchNote: describeMatch(
          matches.map(({ key }) => key),
          mode,
        ),
      };
    })
    .sort(
      (left, right) =>
        right.duplicates.length - left.duplicates.length ||
        left.normalizedUrl.localeCompare(right.normalizedUrl),
    );
}

/**
 * Groups bookmarks that resolve to the same valid HTTP(S) URL. The oldest
 * bookmark is chosen as the keeper so cleanup is deterministic.
 */
export function findBookmarkDuplicateGroups(
  bookmarks: DuplicateBookmarkCandidate[],
  mode: DuplicateMatchMode = "tracking",
): BookmarkDuplicateGroup[] {
  const bookmarksByUrl = new Map<string, IndexedBookmark[]>();

  for (const bookmark of bookmarks) {
    addBookmarkToIndex(bookmarksByUrl, bookmark, mode);
  }

  return groupsFromIndex(bookmarksByUrl, mode);
}

export async function findBookmarkDuplicateGroupsInBatches(
  bookmarks: DuplicateBookmarkCandidate[],
  mode: DuplicateMatchMode,
  onProgress: (scannedCount: number, totalCount: number) => void,
  signal?: AbortSignal,
  batchSize = 100,
): Promise<BookmarkDuplicateGroup[]> {
  const bookmarksByUrl = new Map<string, IndexedBookmark[]>();

  onProgress(0, bookmarks.length);
  for (let offset = 0; offset < bookmarks.length; offset += batchSize) {
    if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");

    const batch = bookmarks.slice(offset, offset + batchSize);
    for (const bookmark of batch) {
      addBookmarkToIndex(bookmarksByUrl, bookmark, mode);
    }

    onProgress(Math.min(offset + batch.length, bookmarks.length), bookmarks.length);
    if (offset + batch.length < bookmarks.length) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
  return groupsFromIndex(bookmarksByUrl, mode);
}

export function countDuplicateBookmarks(
  groups: BookmarkDuplicateGroup[],
): number {
  return groups.reduce((total, group) => total + group.duplicates.length, 0);
}

export function filterBookmarkDuplicateGroups(
  groups: BookmarkDuplicateGroup[],
  query: string,
): BookmarkDuplicateGroup[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return groups;

  return groups.filter((group) => {
    const searchableText = [
      group.normalizedUrl,
      group.matchNote,
      group.keeper.title,
      group.keeper.url,
      ...group.duplicates.flatMap((bookmark) => [bookmark.title, bookmark.url]),
    ]
      .join(" ")
      .toLocaleLowerCase();

    return terms.every((term) => searchableText.includes(term));
  });
}
