import type { HomeReadspaceArticle } from "./homeLibrary";
import {
  searchReadspaceArticles,
  type ReadspaceSearchPage,
} from "./readspaceSearch";

interface WorkerMatch {
  entryId: string;
  excerpt: string;
  score: number;
}

interface WorkerResponse {
  id: number;
  indexed?: boolean;
  result?: { matches: WorkerMatch[]; total: number };
  error?: string;
}

interface PendingRequest {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
let indexedSignature = "";
let indexingPromise: Promise<void> | null = null;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL("../workers/readspaceSearchWorker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.error) request.reject(new Error(event.data.error));
      else request.resolve(event.data);
    };
    worker.onerror = () => {
      for (const request of pending.values()) {
        request.reject(new Error("The Readspace search worker stopped."));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
      indexedSignature = "";
      indexingPromise = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function requestWorker(message: Record<string, unknown>): Promise<WorkerResponse> {
  const currentWorker = getWorker();
  if (!currentWorker) return Promise.reject(new Error("Worker unavailable"));
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    currentWorker.postMessage({ ...message, id });
  });
}

function getIndexSignature(articles: HomeReadspaceArticle[]): string {
  return articles
    .map(({ entry }) => {
      const folder = entry.folder
        ? `${entry.folder.id}:${entry.folder.name}`
        : "";
      const tags = (entry.tags ?? [])
        .map((tag) => `${tag.id}:${tag.name}`)
        .sort()
        .join(",");
      return `${entry.id}:${entry.updated_at}:${folder}:${tags}`;
    })
    .sort()
    .join("|");
}

async function ensureIndex(
  articles: HomeReadspaceArticle[],
  signature: string,
): Promise<void> {
  if (indexedSignature === signature) return;
  if (indexingPromise) await indexingPromise;
  if (indexedSignature === signature) return;

  indexingPromise = requestWorker({ type: "index", signature, articles }).then(
    () => {
      indexedSignature = signature;
    },
  );
  try {
    await indexingPromise;
  } finally {
    indexingPromise = null;
  }
}

export async function searchReadspaceOffMainThread(
  articles: HomeReadspaceArticle[],
  query: string,
  limit = 100,
  includeContent = true,
): Promise<ReadspaceSearchPage> {
  const currentWorker = getWorker();
  if (!currentWorker) {
    return searchReadspaceArticles(articles, query, limit, { includeContent });
  }

  const signature = getIndexSignature(articles);
  await ensureIndex(articles, signature);
  const response = await requestWorker({
    type: "search",
    query,
    limit,
    includeContent,
  });
  const articlesById = new Map(
    articles.map((article) => [article.entry.id, article]),
  );
  return {
    total: response.result?.total ?? 0,
    matches: (response.result?.matches ?? []).flatMap((match) => {
      const article = articlesById.get(match.entryId);
      return article ? [{ article, excerpt: match.excerpt, score: match.score }] : [];
    }),
  };
}

export { getIndexSignature as getReadspaceIndexSignature };
