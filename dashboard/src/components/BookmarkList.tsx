import { useRef, useEffect, useMemo, useState } from "react";
import { useBookmarkLocalSearch } from "../hooks/useBookmarkLocalSearch";
import BookmarkCard from "./BookmarkCard";
import { BookmarkIcon, Loader2, PlusIcon, Sparkles } from "lucide-react";
import { BookmarkListSkeleton } from "./BookmarkCardSkeleton";
import { Button } from "./ui/button";
import type { Bookmark } from "../types/bookmark";
import { bookmarksForView, type BookmarkView } from "../lib/bookmarkViews";
import { markFirstRetrieval } from "../lib/onboarding";

const SEARCH_PAGE_SIZE = 100;
const BROWSE_PAGE_SIZE = 21;

interface BookmarkListProps {
  bookmarks: Bookmark[];
  bookmarksLoading?: boolean;
  bookmarksError?: unknown;
  onRetryBookmarks?: () => void;
  onRefresh?: () => void;
  folderId: string | null;
  tagId?: string | null;
  searchQuery?: string;
  searchShortcutsEnabled?: boolean;
  onAddBookmark?: () => void;
  onSearchMetaChange?: (meta: {
    isActive: boolean;
    isLoading: boolean;
    count: number;
  }) => void;
}

export default function BookmarkList({
  bookmarks: cachedBookmarks,
  bookmarksLoading = false,
  bookmarksError,
  onRetryBookmarks,
  onRefresh,
  folderId,
  tagId,
  searchQuery = "",
  searchShortcutsEnabled = true,
  onAddBookmark,
  onSearchMetaChange,
}: BookmarkListProps) {
  const normalizedSearch = searchQuery.trim();
  const isSearchMode = normalizedSearch.length > 0;
  const [visibleBrowseCount, setVisibleBrowseCount] = useState(BROWSE_PAGE_SIZE);
  const [searchPageState, setSearchPageState] = useState({
    query: "",
    page: 0,
  });
  const searchPage =
    searchPageState.query === normalizedSearch ? searchPageState.page : 0;
  const searchOffset = searchPage * SEARCH_PAGE_SIZE;

  const localSearchQuery = useBookmarkLocalSearch(normalizedSearch, {
    offset: searchOffset,
    limit: SEARCH_PAGE_SIZE,
  });

  const view = useMemo<BookmarkView>(() => {
    if (tagId) return { kind: "tag", id: tagId };
    if (folderId === "favorites") return { kind: "favorites" };
    if (folderId === "unsorted") return { kind: "unsorted" };
    if (folderId) return { kind: "folder", id: folderId };
    return { kind: "all" };
  }, [folderId, tagId]);
  const browseBookmarks = useMemo(
    () => bookmarksForView(cachedBookmarks, view),
    [cachedBookmarks, view],
  );
  const visibleBrowseBookmarks = browseBookmarks.slice(0, visibleBrowseCount);
  const hasNextPage = visibleBrowseCount < browseBookmarks.length;

  const bookmarks = isSearchMode
    ? (localSearchQuery.data?.bookmarks ?? [])
    : visibleBrowseBookmarks;
  const shortcutBookmarks = useMemo(
    () =>
      isSearchMode && searchShortcutsEnabled
        ? (localSearchQuery.data?.bookmarks ?? []).slice(0, 9)
        : [],
    [
      isSearchMode,
      localSearchQuery.data?.bookmarks,
      searchShortcutsEnabled,
    ],
  );
  const searchResultTotal = localSearchQuery.data?.total ?? 0;
  const isLoading = isSearchMode
    ? localSearchQuery.isLoading
    : bookmarksLoading;
  const effectiveError = isSearchMode
    ? localSearchQuery.error
    : bookmarksError;
  const retryBookmarks = () => {
    if (isSearchMode) return localSearchQuery.refetch();
    return onRetryBookmarks?.();
  };

  useEffect(() => {
    setVisibleBrowseCount(BROWSE_PAGE_SIZE);
  }, [view]);

  useEffect(() => {
    onSearchMetaChange?.({
      isActive: isSearchMode,
      isLoading: localSearchQuery.isLoading,
      count: isSearchMode ? searchResultTotal : 0,
    });
  }, [
    onSearchMetaChange,
    isSearchMode,
    localSearchQuery.isLoading,
    searchResultTotal,
  ]);

  useEffect(() => {
    if (shortcutBookmarks.length === 0) return;

    const handleResultShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        (!event.metaKey && !event.ctrlKey) ||
        !/^[1-9]$/.test(event.key)
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[role="dialog"], [aria-modal="true"]')
      ) {
        return;
      }

      const bookmark = shortcutBookmarks[Number(event.key) - 1];
      if (!bookmark) return;

      event.preventDefault();
      markFirstRetrieval(bookmark.user_id);
      window.open(bookmark.url, "_blank", "noopener,noreferrer");
    };

    window.addEventListener("keydown", handleResultShortcut);
    return () => window.removeEventListener("keydown", handleResultShortcut);
  }, [shortcutBookmarks]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Trigger fetchNextPage when the sentinel div enters viewport
  useEffect(() => {
    if (isSearchMode) return;
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      if (!entries[0].isIntersecting || !hasNextPage) return;
      setVisibleBrowseCount((current) => current + BROWSE_PAGE_SIZE);
    };

    observerRef.current = new IntersectionObserver(handleIntersection, {
      threshold: 0.1,
    });

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isSearchMode, hasNextPage]);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading bookmarks">
        <BookmarkListSkeleton />
      </div>
    );
  }

  if (effectiveError) {
    return (
      <div
        className="bg-red-500/10 border border-red-500/30 text-red-500  px-4 py-3 rounded-lg text-sm"
        role="alert"
      >
        <p>
          {effectiveError instanceof Error
            ? effectiveError.message
            : "Error loading bookmarks"}
        </p>
        <Button
          type="button"
          outline
          className="mt-3"
          onClick={() => void retryBookmarks()}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    if (isSearchMode) {
      return (
        <div
          className="rounded-xl border border-[var(--app-ink)]/12 bg-[var(--app-highlight)]/80 px-5 py-9 text-center shadow-sm"
          role="status"
        >
          <BookmarkIcon
            className="mx-auto mb-3 text-[#94a3b8]"
            size={36}
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-[var(--app-ink)]">
            No bookmarks match "{normalizedSearch}"
          </p>
          <p className="mt-1 text-sm text-[var(--app-muted)]">
            Try fewer keywords or search by domain, tag, or collection name.
          </p>
        </div>
      );
    }

    return (
      <div className="relative isolate overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_88%,var(--app-highlight))] px-5 py-10 text-center shadow-[0_6px_0_0_color-mix(in_oklab,var(--app-line)_9%,transparent)] sm:px-8 sm:py-12">
        <div
          className="absolute -left-12 -top-16 -z-10 size-40 rounded-full bg-[color-mix(in_oklab,var(--app-accent)_18%,transparent)] blur-2xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-20 -right-12 -z-10 size-48 rounded-full bg-[color-mix(in_oklab,var(--app-secondary)_14%,transparent)] blur-3xl"
          aria-hidden="true"
        />

        <div className="mx-auto flex max-w-md flex-col items-center">
          <div className="relative mb-5">
            <div className="flex size-16 items-center justify-center rounded-2xl border border-[color-mix(in_oklab,var(--app-primary)_22%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_12%,var(--app-card))] text-[var(--app-primary)] shadow-[0_5px_0_0_color-mix(in_oklab,var(--app-line)_10%,transparent)]">
              <BookmarkIcon size={30} strokeWidth={2.2} aria-hidden="true" />
            </div>
            <span className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--app-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--app-accent)_20%,var(--app-card))] text-[var(--app-ink)] shadow-sm">
              <Sparkles size={14} aria-hidden="true" />
            </span>
          </div>

          <h3 className="text-xl font-bold tracking-tight text-[var(--app-ink)] sm:text-2xl">
            Save your first bookmark
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--app-muted)] sm:text-base">
            Keep useful links close, organized, and easy to find whenever you
            need them.
          </p>

          {onAddBookmark ? (
            <Button
              type="button"
              color="emerald"
              onClick={onAddBookmark}
              className="mt-6 min-h-11 items-center gap-2 px-4"
            >
              <PlusIcon data-slot="icon" aria-hidden="true" />
              Add your first link
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {bookmarks.map((bookmark, index) => (
          <li key={bookmark.id} className="list-none h-full relative">
            <BookmarkCard
              bookmark={bookmark}
              onDeleted={onRefresh || (() => {})}
              onMoved={onRefresh}
              searchShortcut={
                isSearchMode && searchShortcutsEnabled && index < 9
                  ? index + 1
                  : undefined
              }
            />
          </li>
        ))}
      </ul>

      {isSearchMode && searchResultTotal > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[var(--app-card)] px-4 py-3 sm:flex-row">
          <p className="text-sm tabular-nums liquid-muted">
            Showing {searchOffset + 1}–
            {Math.min(searchOffset + bookmarks.length, searchResultTotal)} of{" "}
            {searchResultTotal.toLocaleString("en-US")} bookmarks
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              outline
              disabled={searchPage === 0 || localSearchQuery.isFetching}
              onClick={() =>
                setSearchPageState({
                  query: normalizedSearch,
                  page: Math.max(0, searchPage - 1),
                })
              }
            >
              Previous
            </Button>
            <Button
              type="button"
              outline
              disabled={
                searchOffset + bookmarks.length >= searchResultTotal ||
                localSearchQuery.isFetching
              }
              onClick={() =>
                setSearchPageState({
                  query: normalizedSearch,
                  page: searchPage + 1,
                })
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {/* Intersection observer sentinel – always rendered so the observer can attach */}
      {!isSearchMode && (
        <div ref={loadMoreRef} className="flex justify-center py-5">
          {hasNextPage && (
            <div
              className="flex items-center gap-2 text-gray-500 dark:text-[var(--app-muted)] "
              role="status"
              aria-live="polite"
            >
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span className="text-sm">Loading more...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
