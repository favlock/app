import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { SEARCH_ENGINES, type SearchEngine } from "../constants/searchEngines";
import { getDirectNavigationUrl } from "../lib/searchNavigation";
import { useBookmarkStore } from "../store/bookmarkStore";

const MIN_SEARCH_HISTORY_QUERY_LENGTH = 3;

interface SearchCommandBarProps {
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  onEngineChange?: (engine: SearchEngine) => void;
  onRetryBookmarkSearch?: () => void;
  bookmarkSearchError?: string | null;
  bookmarkSearchStatus?: string;
  searchHistory?: string[];
  onSearchSubmitted?: (query: string) => void | Promise<void>;
}

export default function SearchCommandBar({
  inputRef: externalInputRef,
  onEngineChange,
  onRetryBookmarkSearch,
  bookmarkSearchError,
  bookmarkSearchStatus,
  searchHistory = [],
  onSearchSubmitted,
}: SearchCommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="relative flex min-h-12 min-w-0 flex-1 items-center rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,white)] px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-[border-color,box-shadow] focus-within:border-[color-mix(in_oklab,var(--app-primary)_42%,transparent)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_11%,transparent)]">
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
                    setHistoryOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="theme-button-icon inline-flex size-9 shrink-0 rounded-lg"
                  aria-label="Clear search"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              ) : (
                <span className="hidden shrink-0 rounded-md border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-white/55 px-2 py-1 text-xs font-medium text-[var(--app-muted)] md:inline-flex">
                  /
                </span>
              )}
            </div>

            <div className="flex min-w-0 items-stretch gap-2">
              <label className="relative flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,white)] px-3 text-sm font-medium text-[var(--app-ink)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_11%,transparent)] sm:flex-none">
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
                className="theme-button-primary relative inline-flex min-h-12 flex-none cursor-pointer items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--app-primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={`Search the web with ${selectedEngine.name}`}
              >
                <ExternalLink size={17} aria-hidden="true" />
                <span className="whitespace-nowrap">Search web</span>
              </button>
            </div>
          </div>

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

          <div className="mt-2 flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
            <span className="shrink-0 text-xs text-[var(--app-muted)]">
              Web search is a separate action
            </span>
          </div>

          {bookmarkSearchError ? (
            <div
              className="mt-2 flex items-start justify-between gap-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700"
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
