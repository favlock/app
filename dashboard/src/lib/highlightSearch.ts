import type { WebHighlight } from "../hooks/useHighlightsQuery";
import type { Bookmark } from "../types/bookmark";
import type { HomeReadspaceArticle } from "./homeLibrary";
import { DEFAULT_LIBRARY_SEARCH_FILTERS, hasActiveLibrarySearch, matchesLibraryMetadata, matchesLibraryText, type LibrarySearchFilters } from "./librarySearchFilters";

export type HighlightSearchMatch = {
  highlight: WebHighlight;
  sourceTitle: string;
  sourceUrl: string | null;
  score: number;
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function searchHighlights(
  highlights: WebHighlight[],
  bookmarks: Bookmark[],
  articles: HomeReadspaceArticle[],
  query: string,
  { includeAnnotations = false, filters = DEFAULT_LIBRARY_SEARCH_FILTERS }: { includeAnnotations?: boolean; filters?: LibrarySearchFilters } = {},
): HighlightSearchMatch[] {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (!hasActiveLibrarySearch(query, filters)) return [];
  const bookmarkById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const articleById = new Map(articles.map((article) => [article.entry.id, article]));

  return highlights.flatMap((highlight) => {
    const bookmark = highlight.bookmarkId
      ? bookmarkById.get(highlight.bookmarkId)
      : undefined;
    const article = highlight.entryId
      ? articleById.get(highlight.entryId)
      : undefined;
    const sourceTitle = bookmark?.title ?? article?.entry.title ?? "Saved source";
    const sourceUrl = bookmark?.url ?? article?.content.sourceUrl ?? null;
    const sourceCollection = bookmark?.folders?.[0] ?? article?.entry.folder;
    const sourceTags = bookmark?.tags ?? article?.entry.tags ?? [];
    if (!matchesLibraryMetadata(filters, "highlight", sourceCollection?.id ?? null,
      sourceTags.map((tag) => tag.id))) return [];
    const quote = normalize(highlight.payload.quote.exact);
    const annotation = includeAnnotations ? normalize(highlight.payload.note) : "";
    const source = normalize(`${sourceTitle} ${sourceUrl ?? ""}`);
    if (!matchesLibraryText(query, filters.field, {
      title: sourceTitle,
      url: sourceUrl ?? "",
      tags: sourceTags.map((tag) => tag.name).join(" "),
      collection: sourceCollection?.name ?? "",
      content: `${quote} ${annotation}`,
    })) return [];

    let score = 0;
    for (const term of terms) {
      if (quote.includes(term)) score += 40;
      if (annotation.includes(term)) score += 20;
      if (source.includes(term)) score += 10;
    }
    return [{ highlight, sourceTitle, sourceUrl, score }];
  }).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return right.highlight.updatedAt.localeCompare(left.highlight.updatedAt);
  });
}
