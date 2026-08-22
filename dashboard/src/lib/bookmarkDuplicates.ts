import { normalizeImportedBookmarkUrl } from "./browserBookmarkImport";

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
}

function compareBookmarksByAge(
  left: DuplicateBookmarkCandidate,
  right: DuplicateBookmarkCandidate,
): number {
  const createdAtDifference =
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime();

  return createdAtDifference || left.id.localeCompare(right.id);
}

/**
 * Groups bookmarks that resolve to the same valid HTTP(S) URL. The oldest
 * bookmark is chosen as the keeper so cleanup is deterministic.
 */
export function findBookmarkDuplicateGroups(
  bookmarks: DuplicateBookmarkCandidate[],
): BookmarkDuplicateGroup[] {
  const bookmarksByUrl = new Map<string, DuplicateBookmarkCandidate[]>();

  for (const bookmark of bookmarks) {
    const normalizedUrl = normalizeImportedBookmarkUrl(bookmark.url);
    if (!normalizedUrl) continue;

    const matches = bookmarksByUrl.get(normalizedUrl) ?? [];
    matches.push(bookmark);
    bookmarksByUrl.set(normalizedUrl, matches);
  }

  return [...bookmarksByUrl.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([normalizedUrl, matches]) => {
      const sortedMatches = [...matches].sort(compareBookmarksByAge);
      return {
        normalizedUrl,
        keeper: sortedMatches[0],
        duplicates: sortedMatches.slice(1),
      };
    })
    .sort(
      (left, right) =>
        right.duplicates.length - left.duplicates.length ||
        left.normalizedUrl.localeCompare(right.normalizedUrl),
    );
}

export function countDuplicateBookmarks(
  groups: BookmarkDuplicateGroup[],
): number {
  return groups.reduce((total, group) => total + group.duplicates.length, 0);
}
