import {
  searchCachedBookmarks,
  type BookmarkSearchPage,
} from "./bookmarkCache";

interface SearchWorkerRequest {
  id: number;
  userId: string;
  query: string;
  offset: number;
  limit: number;
}

interface SearchWorkerResponse {
  id: number;
  result?: BookmarkSearchPage;
  error?: string;
}

interface PendingSearch {
  resolve: (result: BookmarkSearchPage) => void;
  reject: (error: Error) => void;
}

let searchWorker: Worker | null = null;
let nextRequestId = 1;
const pendingSearches = new Map<number, PendingSearch>();

function rejectPendingSearches(message: string) {
  for (const pending of pendingSearches.values()) {
    pending.reject(new Error(message));
  }
  pendingSearches.clear();
}

function getSearchWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (searchWorker) return searchWorker;

  try {
    searchWorker = new Worker(
      new URL("../workers/bookmarkSearchWorker.ts", import.meta.url),
      { type: "module" },
    );
    searchWorker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
      const pending = pendingSearches.get(event.data.id);
      if (!pending) return;
      pendingSearches.delete(event.data.id);
      if (event.data.result) pending.resolve(event.data.result);
      else pending.reject(new Error(event.data.error ?? "Bookmark search failed."));
    };
    searchWorker.onerror = () => {
      rejectPendingSearches("The local bookmark search worker stopped unexpectedly.");
      searchWorker?.terminate();
      searchWorker = null;
    };
  } catch {
    searchWorker = null;
  }

  return searchWorker;
}

export async function searchCachedBookmarksOffMainThread(
  userId: string,
  query: string,
  options: { offset?: number; limit?: number } = {},
): Promise<BookmarkSearchPage> {
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.floor(options.limit ?? 100));
  const worker = getSearchWorker();

  if (!worker) {
    return searchCachedBookmarks(userId, query, { offset, limit });
  }

  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pendingSearches.set(id, { resolve, reject });
    worker.postMessage({ id, userId, query, offset, limit } satisfies SearchWorkerRequest);
  });
}
