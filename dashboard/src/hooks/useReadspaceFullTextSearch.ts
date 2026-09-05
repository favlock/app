import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { HomeReadspaceArticle } from "../lib/homeLibrary";
import {
  getReadspaceIndexSignature,
  searchReadspaceOffMainThread,
} from "../lib/readspaceSearchWorkerClient";

export function useReadspaceFullTextSearch(
  articles: HomeReadspaceArticle[],
  query: string,
  limit = 100,
  includeContent = true,
  enabled = true,
) {
  const normalized = query.trim();
  const signature = useMemo(
    () => getReadspaceIndexSignature(articles),
    [articles],
  );

  return useQuery({
    queryKey: [
      "readspace",
      "search",
      signature,
      normalized,
      limit,
      includeContent,
    ],
    queryFn: () =>
      searchReadspaceOffMainThread(
        articles,
        normalized,
        limit,
        includeContent,
      ),
    enabled: enabled && normalized.length > 0,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
}
