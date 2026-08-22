import type { HomeReadspaceArticle } from "../lib/homeLibrary";
import { searchReadspaceArticles } from "../lib/readspaceSearch";

type WorkerRequest =
  | {
      id: number;
      type: "index";
      signature: string;
      articles: HomeReadspaceArticle[];
    }
  | {
      id: number;
      type: "search";
      query: string;
      limit: number;
      includeContent: boolean;
    };

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

const scope = globalThis as unknown as WorkerScope;
let indexedArticles: HomeReadspaceArticle[] = [];

scope.onmessage = (event) => {
  const request = event.data;
  try {
    if (request.type === "index") {
      indexedArticles = request.articles;
      scope.postMessage({ id: request.id, indexed: true });
      return;
    }

    const result = searchReadspaceArticles(
      indexedArticles,
      request.query,
      request.limit,
      { includeContent: request.includeContent },
    );
    scope.postMessage({
      id: request.id,
      result: {
        total: result.total,
        matches: result.matches.map(({ article, excerpt, score }) => ({
          entryId: article.entry.id,
          excerpt,
          score,
        })),
      },
    });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : "Readspace search failed.",
    });
  }
};

export {};
