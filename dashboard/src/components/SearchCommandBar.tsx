import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";
import { BookmarkPlus, ChevronDown, ExternalLink, Search, SlidersHorizontal, X } from "lucide-react";
import { SEARCH_ENGINES, type SearchEngine } from "../constants/searchEngines";
import { getDirectNavigationUrl } from "../lib/searchNavigation";
import { useBookmarkStore } from "../store/bookmarkStore";
import { DEFAULT_LIBRARY_SEARCH_FILTERS, hasActiveLibrarySearch, hasRefinedLibrarySearch, type LibrarySearchFilters, type SearchField, type SearchItemType } from "../lib/librarySearchFilters";
import type { Folder, Tag } from "../types/bookmark";

const MIN_SEARCH_HISTORY_QUERY_LENGTH = 3;
const SEARCH_FIELD_LABELS: Record<Exclude<SearchField, "all">, string> = {
  title: "By item name",
  url: "By URL",
  tag: "By tag name",
  collection: "By collection name",
};
const ITEM_TYPE_LABELS: Record<Exclude<SearchItemType, "all">, string> = {
  bookmark: "Bookmarks",
  note: "Documents",
  todo: "Tasks",
  readspace: "Readspace",
  highlight: "Highlights",
};

interface SearchCommandBarProps {
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  onEngineChange?: (engine: SearchEngine) => void;
  onRetryBookmarkSearch?: () => void;
  bookmarkSearchError?: string | null;
  bookmarkSearchStatus?: string;
  searchHistory?: string[];
  onSearchSubmitted?: (query: string) => void | Promise<void>;
  filters?: LibrarySearchFilters;
  onFiltersChange?: (filters: LibrarySearchFilters) => void;
  folders?: Folder[];
  tags?: Tag[];
  isLocalAccount?: boolean;
  canSaveSmartView?: boolean;
  onSaveSmartView?: () => void;
  onQueryChange?: (query: string) => void;
}

export default function SearchCommandBar({
  inputRef: externalInputRef,
  onEngineChange,
  onRetryBookmarkSearch,
  bookmarkSearchError,
  bookmarkSearchStatus,
  searchHistory = [],
  onSearchSubmitted,
  filters = DEFAULT_LIBRARY_SEARCH_FILTERS,
  onFiltersChange,
  folders = [],
  tags = [],
  isLocalAccount = false,
  canSaveSmartView = false,
  onSaveSmartView,
  onQueryChange,
}: SearchCommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(-1);
  const { searchQuery, setSearchQuery, selectedEngine, setSelectedEngine } =
    useBookmarkStore();

  const matchingHistory = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (normalizedQuery.length < MIN_SEARCH_HISTORY_QUERY_LENGTH) return [];

    return searchHistory
      .filter((query) => query.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 10);
  }, [searchHistory, searchQuery]);

  const activeFilterLabels = [
    filters.field !== "all" ? SEARCH_FIELD_LABELS[filters.field] : null,
    filters.itemType !== "all" ? ITEM_TYPE_LABELS[filters.itemType] : null,
    filters.tagId ? `Tag: ${tags.find((tag) => tag.id === filters.tagId)?.name ?? "Deleted tag"}` : null,
    filters.collectionId ? `Collection: ${folders.find((folder) => folder.id === filters.collectionId)?.name ?? "Deleted collection"}` : null,
    filters.favoritesOnly ? "Favorites only" : null,
  ].filter((label): label is string => label !== null);

  useEffect(() => {
    if (window.matchMedia?.("(min-width: 768px) and (pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    setActiveHistoryIndex(-1);
  }, [searchQuery]);

  const handleEngineChange = (slug: string) => {
    const engine = SEARCH_ENGINES.find((item) => item.slug === slug);
    if (!engine) return;

    setSelectedEngine(engine);
    onEngineChange?.(engine);
    inputRef.current?.focus();
  };

  const submitWebSearch = (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    const directUrl = getDirectNavigationUrl(trimmedQuery);
    window.open(
      directUrl ?? `${selectedEngine.url}${encodeURIComponent(trimmedQuery)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setSearchQuery("");
    setHistoryOpen(false);
    setActiveHistoryIndex(-1);
    void Promise.resolve(onSearchSubmitted?.(trimmedQuery)).catch(
      console.error,
    );
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const selectHistoryQuery = (query: string) => {
    setSearchQuery(query);
    onQueryChange?.(query);
    setHistoryOpen(false);
    setActiveHistoryIndex(-1);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!matchingHistory.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHistoryOpen(true);
      setActiveHistoryIndex((index) =>
        index >= matchingHistory.length - 1 ? 0 : index + 1,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHistoryOpen(true);
      setActiveHistoryIndex((index) =>
        index <= 0 ? matchingHistory.length - 1 : index - 1,
      );
    } else if (event.key === "Escape") {
      setHistoryOpen(false);
      setActiveHistoryIndex(-1);
    } else if (
      event.key === "Enter" &&
      historyOpen &&
      activeHistoryIndex >= 0
    ) {
      event.preventDefault();
      selectHistoryQuery(matchingHistory[activeHistoryIndex]);
    }
  };

  const filterSelectClass = "min-h-10 min-w-0 max-w-full rounded-lg border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[var(--app-card)] px-2.5 text-sm text-[var(--app-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]";

  return (
    <section
      className="relative z-40 overflow-visible px-3 lg:px-0"
      aria-label="Library search"
    >
      <div className="app-surface overflow-visible rounded-[1.15rem] p-2.5 sm:p-3">
        <form
          ref={formRef}
          onSubmit={handleSearch}
          onBlur={(event) => {
            if (!formRef.current?.contains(event.relatedTarget)) {
              setHistoryOpen(false);
              setActiveHistoryIndex(-1);
            }
          }}
          className="relative z-50 w-full min-w-0"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
            <div className="relative flex min-h-12 min-w-0 flex-1 items-center rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,var(--app-highlight))] px-3 shadow-[inset_0_1px_0_var(--app-glint)] transition-[border-color,box-shadow] focus-within:border-[color-mix(in_oklab,var(--app-primary)_42%,transparent)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_11%,transparent)]">
              <Search
                size={19}
                className="flex-none text-[var(--app-muted)]"
                aria-hidden="true"
              />
              <input
                ref={(element) => {
                  inputRef.current = element;
                  if (externalInputRef) externalInputRef.current = element;
                }}
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setSearchQuery(nextQuery);
                  onQueryChange?.(nextQuery);
                  setHistoryOpen(
                    nextQuery.trim().length >= MIN_SEARCH_HISTORY_QUERY_LENGTH,
                  );
                }}
                onKeyDown={handleSearchKeyDown}
                aria-label="Search your library"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={historyOpen && matchingHistory.length > 0}
                aria-controls="search-history-suggestions"
                aria-activedescendant={
                  activeHistoryIndex >= 0
                    ? `search-history-option-${activeHistoryIndex}`
                    : undefined
                }
                className="min-w-0 flex-1 border-none bg-transparent px-2.5 py-2 text-base text-[var(--app-ink)] placeholder-[color-mix(in_oklab,var(--app-muted)_72%,transparent)] outline-none [&::-webkit-search-cancel-button]:hidden"
                placeholder="Search your library"
              />

              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    onQueryChange?.("");
                    setHistoryOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="theme-button-icon inline-flex size-9 shrink-0 rounded-lg"
                  aria-label="Clear search"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              ) : (
                <span className="hidden shrink-0 rounded-md border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-[var(--app-highlight)]/55 px-2 py-1 text-xs font-medium text-[var(--app-muted)] md:inline-flex">
                  /
                </span>
              )}
            </div>

            <div className="flex min-w-0 items-stretch gap-2 sm:justify-end">
              <label className="relative flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,var(--app-highlight))] px-3 text-sm font-medium text-[var(--app-ink)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_11%,transparent)] sm:flex-none">
                <span className="sr-only">Web search engine</span>
                <img src={selectedEngine.logo} alt="" className="size-5 flex-none" />
                <select
                  value={selectedEngine.slug}
                  onChange={(event) => handleEngineChange(event.target.value)}
                  aria-label={`Search engine: ${selectedEngine.name}`}
                  className="min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent pr-5 text-sm font-medium outline-none sm:max-w-28"
                >
                  {SEARCH_ENGINES.map((engine) => (
                    <option key={engine.slug} value={engine.slug}>
                      {engine.name}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-2.5 size-3.5 text-[var(--app-muted)]"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
                </svg>
              </label>

              <button
                type="button"
                onClick={() => submitWebSearch(searchQuery)}
                disabled={!searchQuery.trim()}
                className="relative inline-flex min-h-12 flex-none cursor-pointer items-center justify-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[var(--app-card)] px-4 text-sm font-semibold text-[var(--app-ink)] hover:bg-[var(--app-highlight)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={`Search the web with ${selectedEngine.name}`}
              >
                <ExternalLink size={17} aria-hidden="true" />
                <span className="whitespace-nowrap">Search web</span>
              </button>
            </div>
          </div>

          {onFiltersChange ? (
            <>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                <button type="button" aria-expanded={filtersOpen} aria-controls="library-search-filter-panel"
                  onClick={() => setFiltersOpen((open) => !open)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[var(--app-card)] px-3 text-sm font-semibold text-[var(--app-ink)] hover:bg-[var(--app-highlight)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  Filters
                  {activeFilterLabels.length > 0 ? <span className="rounded-md bg-[var(--app-highlight)] px-1.5 text-xs text-[var(--app-primary)]">{activeFilterLabels.length}</span> : null}
                  <ChevronDown size={15} aria-hidden="true" className={`text-[var(--app-muted)] transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                </button>
                {activeFilterLabels.length > 0 ? <span className="order-3 w-full truncate text-xs text-[var(--app-muted)] sm:order-none sm:min-w-0 sm:flex-1 sm:text-sm sm:w-auto"
                  title={activeFilterLabels.join(" · ")}>{activeFilterLabels.join(" · ")}</span> : <span className="flex-1" />}
                {filtersOpen && onSaveSmartView ? <span className="group relative inline-flex shrink-0" tabIndex={!canSaveSmartView ? 0 : undefined}
                  title={!canSaveSmartView ? "Available on Pro" : !hasActiveLibrarySearch(searchQuery, filters) ? "Start a search first" : undefined}>
                  <button type="button" onClick={onSaveSmartView}
                    disabled={!canSaveSmartView || !hasActiveLibrarySearch(searchQuery, filters)}
                    aria-label={canSaveSmartView ? "Save Smart View" : "Save Smart View, available on Pro"}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--app-line)] px-3 text-sm font-semibold text-[var(--app-ink)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--app-highlight)] focus-visible:outline-2 focus-visible:outline-[var(--app-primary)]">
                    <BookmarkPlus size={16} aria-hidden="true" />
                    <span className="sm:hidden">Save view</span>
                    <span className="hidden sm:inline">Save Smart View</span>
                  </button>
                  {!canSaveSmartView ? <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 mb-2 hidden whitespace-nowrap rounded-lg bg-[var(--app-ink)] px-2 py-1 text-xs text-[var(--app-bg)] group-hover:block group-focus-within:block">Available on Pro</span> : null}
                </span> : null}
              </div>
              <div id="library-search-filter-panel" hidden={!filtersOpen} aria-label="Library search filters"
                className="mt-3 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[var(--app-card)] p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-[var(--app-muted)]">
                    Search by
                    <select aria-label="Search by" className={`${filterSelectClass} w-full`} value={filters.field}
                      onChange={(event) => onFiltersChange({ ...filters, field: event.target.value as SearchField })}>
                      <option value="all">All fields</option>
                      <option value="title">Item name</option>
                      <option value="url">URL</option>
                      <option value="tag">Tag name</option>
                      <option value="collection">Collection name</option>
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-[var(--app-muted)]">
                    Item type
                    <select aria-label="Item type" className={`${filterSelectClass} w-full`} value={filters.itemType}
                      onChange={(event) => {
                        const itemType = event.target.value as SearchItemType;
                        onFiltersChange({ ...filters, itemType, favoritesOnly: itemType !== "all" && itemType !== "bookmark" ? false : filters.favoritesOnly });
                      }}>
                      <option value="all">All items</option>
                      <option value="bookmark">Bookmarks</option>
                      <option value="note">Documents</option>
                      <option value="todo">Tasks</option>
                      {!isLocalAccount ? <option value="readspace">Readspace</option> : null}
                      {!isLocalAccount ? <option value="highlight">Highlights</option> : null}
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-[var(--app-muted)]">
                    Tag
                    <select aria-label="Filter by tag" className={`${filterSelectClass} w-full`} value={filters.tagId ?? ""}
                      onChange={(event) => onFiltersChange({ ...filters, tagId: event.target.value || null })}>
                      <option value="">Any tag</option>
                      {filters.tagId && !tags.some((tag) => tag.id === filters.tagId) ? <option value={filters.tagId}>Deleted tag</option> : null}
                      {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-[var(--app-muted)]">
                    Collection
                    <select aria-label="Filter by collection" className={`${filterSelectClass} w-full`} value={filters.collectionId ?? ""}
                      onChange={(event) => onFiltersChange({ ...filters, collectionId: event.target.value || null })}>
                      <option value="">Any collection</option>
                      {filters.collectionId && !folders.some((folder) => folder.id === filters.collectionId) ? <option value={filters.collectionId}>Deleted collection</option> : null}
                      {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] pt-3">
                  <label className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--app-ink)]">
                    <input type="checkbox" checked={filters.favoritesOnly}
                      disabled={filters.itemType !== "all" && filters.itemType !== "bookmark"}
                      onChange={(event) => onFiltersChange({ ...filters, favoritesOnly: event.target.checked })}
                      className="size-4 accent-[var(--app-primary)]" />
                    Favorites only
                  </label>
                  {hasRefinedLibrarySearch(filters) ? <button type="button" onClick={() => onFiltersChange(DEFAULT_LIBRARY_SEARCH_FILTERS)}
                    className="min-h-10 rounded-lg px-2 text-sm font-semibold text-[var(--app-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]">
                    Clear filters
                  </button> : null}
                </div>
              </div>
            </>
          ) : null}

          {historyOpen && matchingHistory.length > 0 ? (
            <div
              id="search-history-suggestions"
              role="listbox"
              aria-label="Recent searches"
              className="absolute top-[calc(100%+0.4rem)] right-0 left-0 z-50 app-popup-surface [--popup-inset:0.375rem] p-1.5"
            >
              <div className="px-2.5 py-1.5 text-xs font-semibold tracking-wide text-[var(--app-muted)] uppercase">
                Recent searches
              </div>
              {matchingHistory.map((query, index) => (
                <button
                  id={`search-history-option-${index}`}
                  key={query}
                  type="button"
                  role="option"
                  aria-selected={activeHistoryIndex === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveHistoryIndex(index)}
                  onClick={() => selectHistoryQuery(query)}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    activeHistoryIndex === index
                      ? "bg-[color-mix(in_oklab,var(--app-primary)_11%,var(--app-card))] text-[var(--app-ink)]"
                      : "text-[var(--app-muted)] hover:bg-[color-mix(in_oklab,var(--app-line)_5%,transparent)]"
                  }`}
                >
                  <Search size={16} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{query}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2 px-1">
            {bookmarkSearchStatus ? (
              <span
                className="text-xs leading-5 text-[var(--app-muted)] sm:text-sm"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {bookmarkSearchStatus}
              </span>
            ) : (
              <span className="text-xs text-[var(--app-muted)] sm:text-sm">
                Results update as you type.
              </span>
            )}
          </div>

          {bookmarkSearchError ? (
            <div
              className="mt-2 flex items-start justify-between gap-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
              role="alert"
            >
              <span>{bookmarkSearchError}</span>
              {onRetryBookmarkSearch ? (
                <button
                  type="button"
                  className="shrink-0 font-semibold underline underline-offset-2"
                  onClick={onRetryBookmarkSearch}
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
}
