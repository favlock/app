export type SearchField = "all" | "title" | "url" | "tag" | "collection";
export type SearchItemType = "all" | "bookmark" | "note" | "todo" | "readspace" | "highlight";

export interface LibrarySearchFilters {
  field: SearchField;
  itemType: SearchItemType;
  tagId: string | null;
  collectionId: string | null;
  favoritesOnly: boolean;
}

export const DEFAULT_LIBRARY_SEARCH_FILTERS: LibrarySearchFilters = {
  field: "all",
  itemType: "all",
  tagId: null,
  collectionId: null,
  favoritesOnly: false,
};

export function hasActiveLibrarySearch(query: string, filters: LibrarySearchFilters): boolean {
  return Boolean(query.trim()) || filters.itemType !== "all" ||
    filters.tagId !== null || filters.collectionId !== null || filters.favoritesOnly;
}

export function hasRefinedLibrarySearch(filters: LibrarySearchFilters): boolean {
  return filters.field !== "all" || filters.itemType !== "all" ||
    filters.tagId !== null || filters.collectionId !== null || filters.favoritesOnly;
}

export function matchesLibraryMetadata(
  filters: LibrarySearchFilters,
  itemType: Exclude<SearchItemType, "all">,
  collectionId: string | null,
  tagIds: string[],
  isFavorite = false,
): boolean {
  return (filters.itemType === "all" || filters.itemType === itemType) &&
    (!filters.collectionId || filters.collectionId === collectionId) &&
    (!filters.tagId || tagIds.includes(filters.tagId)) &&
    (!filters.favoritesOnly || (itemType === "bookmark" && isFavorite));
}

export function matchesLibraryText(
  query: string,
  field: SearchField,
  values: { title: string; url?: string; tags?: string; collection?: string; content?: string },
): boolean {
  const normalize = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = (field === "all"
    ? [values.title, values.url, values.tags, values.collection, values.content]
    : [field === "title" ? values.title
      : field === "url" ? values.url
      : field === "tag" ? values.tags : values.collection]
  ).filter(Boolean).join(" ").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}
