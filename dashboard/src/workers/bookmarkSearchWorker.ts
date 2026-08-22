import { searchCachedBookmarks } from "../lib/bookmarkCache";

interface SearchWorkerRequest {
  id: number;
  userId: string;
  query: string;
  offset: number;
  limit: number;
}

type SearchWorkerScope = {
  onmessage: ((event: MessageEvent<SearchWorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

const workerScope = globalThis as unknown as SearchWorkerScope;

workerScope.onmessage = (event) => {
  const { id, userId, query, offset, limit } = event.data;
  void searchCachedBookmarks(userId, query, { offset, limit })
    .then((result) => workerScope.postMessage({ id, result }))
    .catch((error: unknown) => {
      workerScope.postMessage({
        id,
        error: error instanceof Error ? error.message : "Bookmark search failed.",
      });
    });
};

export {};
