import type { BookmarkSorting } from "../lib/bookmarkSorting";
import { searchCachedBookmarks } from "../lib/bookmarkCache";
import type { LibrarySearchFilters } from "../lib/librarySearchFilters";

interface SearchWorkerRequest {
  id: number;
  userId: string;
  query: string;
  offset: number;
  limit: number;
  sorting?: BookmarkSorting;
  filters?: LibrarySearchFilters;
}

type SearchWorkerScope = {
  onmessage: ((event: MessageEvent<SearchWorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

const workerScope = globalThis as unknown as SearchWorkerScope;

workerScope.onmessage = (event) => {
  const { id, userId, query, offset, limit, sorting, filters } = event.data;
  void searchCachedBookmarks(userId, query, { offset, limit, sorting, filters })
    .then((result) => workerScope.postMessage({ id, result }))
    .catch((error: unknown) => {
      workerScope.postMessage({
        id,
        error: error instanceof Error ? error.message : "Bookmark search failed.",
      });
    });
};

export {};
