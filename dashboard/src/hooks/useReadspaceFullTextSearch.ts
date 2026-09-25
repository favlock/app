import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { HomeReadspaceArticle } from "../lib/homeLibrary";
import { DEFAULT_LIBRARY_SEARCH_FILTERS, hasActiveLibrarySearch, type LibrarySearchFilters } from "../lib/librarySearchFilters";
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
  filters: LibrarySearchFilters = DEFAULT_LIBRARY_SEARCH_FILTERS,
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
      filters,
    ],
    queryFn: () =>
      searchReadspaceOffMainThread(
        articles,
        normalized,
        limit,
        includeContent,
        filters,
      ),
    enabled: enabled && hasActiveLibrarySearch(normalized, filters),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
}
