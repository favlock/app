import BookmarkSortControl from "../components/BookmarkSortControl";
import LibraryLayoutControl from "../components/LibraryLayoutControl";
import { useLibraryLayout } from "../hooks/useLibraryLayout";
import { useSortPreferenceSync } from "../hooks/useSortPreferenceSync";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { AddBookmarkButton } from "../components/AddBookmarkForm";
import BookmarkList from "../components/BookmarkList";
import { useFolders } from "../hooks/useFoldersQuery";
import { useTags } from "../hooks/useTagsQuery";
import {
  useUpdateSearchEngine,
  useUserInfo,
} from "../hooks/useUserInfoQuery";
import { Menu } from "lucide-react";
import CollectionHeaderActions from "../components/CollectionHeaderActions";
import TagHeaderActions from "../components/TagHeaderActions";
import {
  buildCollectionSlugIndex,
  buildTagSlugIndex,
} from "../lib/collectionSlugs";
import type { DashboardLayoutContext } from "./DashboardLayout";
import { useDebounce } from "../hooks/useDebounce";
import { useAuth } from "../context/useAuth";
import { useCachedBookmarks } from "../hooks/useCachedBookmarks";
import SearchCommandBar from "../components/SearchCommandBar";
import { useBookmarkStore } from "../store/bookmarkStore";
import { useNotes } from "../hooks/useNotesQuery";
import { searchNotes } from "../lib/noteSearch";
import NoteSearchResults from "../components/NoteSearchResults";
import NoteEditorDialog from "../components/NoteEditorDialog";
import type { Note, Todo } from "../types/bookmark";
import HomeLibraryGrid from "../components/HomeLibraryGrid";
import HomeAddMenu from "../components/HomeAddMenu";
import { useSearchHistory } from "../hooks/useSearchHistory";
import { useTodos } from "../hooks/useTodosQuery";
import { searchTodos } from "../lib/todoSearch";
import TodoSearchResults from "../components/TodoSearchResults";
import TodoEditorDialog from "../components/TodoEditorDialog";
import ReadspaceArticleDialog from "../components/ReadspaceArticleDialog";
import ReadspaceOrganizationDialog from "../components/ReadspaceOrganizationDialog";
import {
  useDeleteReadspaceEntry,
  useReadspace,
} from "../hooks/useReadspaceQuery";
import { parseReadspaceContent } from "../lib/readspaceContent";
import type { HomeReadspaceArticle } from "../lib/homeLibrary";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import CollectionLibraryGrid from "../components/CollectionLibraryGrid";
import ReadspaceSearchResults from "../components/ReadspaceSearchResults";
import { useReadspaceFullTextSearch } from "../hooks/useReadspaceFullTextSearch";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { markFirstRetrieval } from "../lib/onboarding";
import { useHighlights } from "../hooks/useHighlightsQuery";
import { useBookmarks } from "../hooks/useBookmarksQuery";
import { searchHighlights } from "../lib/highlightSearch";
import HighlightSearchResults from "../components/HighlightSearchResults";
import { useBookmarkUsage } from "../hooks/useBookmarkUsage";
import { DEFAULT_LIBRARY_SEARCH_FILTERS, hasActiveLibrarySearch, hasRefinedLibrarySearch, type LibrarySearchFilters } from "../lib/librarySearchFilters";
import { useSavedSmartViews } from "../hooks/useSavedSmartViews";
import SaveSmartViewDialog from "../components/SaveSmartViewDialog";
import SmartViewHeaderActions from "../components/SmartViewHeaderActions";

export default function Dashboard() {
  const { setIsMobileSidebarOpen, openAddBookmark } =
    useOutletContext<DashboardLayoutContext>();
  const {
    bookmarkCacheSyncing,
    bookmarkCacheSyncedAt,
    bookmarkCacheError,
    retryBookmarkCacheSync,
    isLocalAccount,
    user,
  } = useAuth();
  const sortSync = useSortPreferenceSync();
  const { value: sortPreference, update: setSortPreference } = sortSync;
  const { layout, update: setLayout } = useLibraryLayout(user?.id);
  const { collectionSlug, tagSlug, smartViewId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: folders = [] } = useFolders();
  const { data: tags = [], isLoading: loadingTags } = useTags();
  const cachedBookmarksQuery = useCachedBookmarks();
  const { searchQuery, setSearchQuery } = useBookmarkStore();
  const cachedBookmarks = useMemo(
    () => cachedBookmarksQuery.data ?? [],
    [cachedBookmarksQuery.data],
  );
  const usageQuery = useBookmarkUsage(sortPreference.order === "most-used" && !searchQuery.trim());
  const rankedBookmarks = useMemo(() => sortPreference.order === "most-used" && usageQuery.isPending
    ? [] : cachedBookmarks.map((bookmark) => ({
    ...bookmark, open_count: usageQuery.data?.[bookmark.id] ?? 0,
  })), [cachedBookmarks, usageQuery.data, usageQuery.isPending, sortPreference.order]);
  const updateSearchEngine = useUpdateSearchEngine();
  const { data: userInfo } = useUserInfo();
  const searchHistory = useSearchHistory();
  const { data: accountPlan } = useAccountPlan();
  const fullTextSearchEnabled = accountPlan?.id === "pro";
  const [searchFilters, setSearchFilters] = useState<LibrarySearchFilters>(DEFAULT_LIBRARY_SEARCH_FILTERS);
  const [saveSmartViewOpen, setSaveSmartViewOpen] = useState(false);
  const previousSmartViewId = useRef(smartViewId);
  const detachingSmartView = useRef(false);
  const smartViews = useSavedSmartViews();
  const selectedSmartView = smartViews.views.find((view) => view.id === smartViewId);
  const bookmarkSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previousSmartViewId.current && !smartViewId) {
      if (!detachingSmartView.current) {
        setSearchQuery("");
        setSearchFilters(DEFAULT_LIBRARY_SEARCH_FILTERS);
      }
      detachingSmartView.current = false;
    }
    previousSmartViewId.current = smartViewId;
  }, [smartViewId, setSearchQuery]);

  useEffect(() => {
    if (!selectedSmartView) return;
    setSearchQuery(selectedSmartView.query);
    setSearchFilters(selectedSmartView.filters);
  }, [selectedSmartView, setSearchQuery]);

  useEffect(() => {
    if (smartViewId && smartViews.ready && !smartViews.isLoading && !smartViews.error && !selectedSmartView) {
      navigate("/", { replace: true });
    }
  }, [smartViewId, smartViews.ready, smartViews.isLoading, smartViews.error, selectedSmartView, navigate]);

  const [bookmarkSearchResults, setBookmarkSearchResults] = useState(0);
  const [bookmarkSearchLoading, setBookmarkSearchLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [todoEditorOpen, setTodoEditorOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [readTarget, setReadTarget] = useState<HomeReadspaceArticle | null>(
    null,
  );
  const [organizeTarget, setOrganizeTarget] =
    useState<HomeReadspaceArticle | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<HomeReadspaceArticle | null>(null);
  const [deleteArticleError, setDeleteArticleError] = useState<string | null>(
    null,
  );
  const debouncedBookmarkSearch = useDebounce(searchQuery, 180);
  const openSavedArticle = (article: HomeReadspaceArticle) => {
    markFirstRetrieval(article.entry.user_id);
    setReadTarget(article);
  };

  const collectionSlugIndex = useMemo(
    () => buildCollectionSlugIndex(folders),
    [folders],
  );
  const tagSlugIndex = useMemo(() => buildTagSlugIndex(tags), [tags]);
  const selectedFolderId = collectionSlug
    ? (collectionSlugIndex.idBySlug.get(collectionSlug) ?? null)
    : null;
  const selectedFolder = selectedFolderId
    ? (folders.find((folder) => folder.id === selectedFolderId) ?? null)
    : null;
  const selectedTagId = tagSlug
    ? (tagSlugIndex.idBySlug.get(tagSlug) ?? null)
    : null;
  const selectedTag = selectedTagId
    ? (tags.find((tag) => tag.id === selectedTagId) ?? null)
    : null;
  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const isSlashShortcut =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;

      if (!isSlashShortcut) return;

      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.getAttribute("role") === "textbox");
      if (isEditableTarget) return;

      event.preventDefault();
      bookmarkSearchInputRef.current?.focus();
      bookmarkSearchInputRef.current?.select();
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedFolderName = selectedFolder?.name;
  const selectedTagName = selectedTag?.name;
  const normalizedBookmarkSearch = debouncedBookmarkSearch.trim();
  const isSearchView = hasActiveLibrarySearch(normalizedBookmarkSearch, searchFilters);
  const cloudSearchEnabled = isSearchView && !isLocalAccount;
  const highlightsQuery = useHighlights(cloudSearchEnabled);
  const highlightSourceBookmarksQuery = useBookmarks(null, {
    enabled: cloudSearchEnabled,
    includeHighlightSources: true,
  });
  const isFavoritesView = location.pathname === "/favorites";
  const isUnsortedView = location.pathname === "/unsorted";
  const effectiveFolderId = isFavoritesView
    ? "favorites"
    : isUnsortedView
      ? "unsorted"
      : selectedFolderId;
  const isAllBookmarksView = !effectiveFolderId && !selectedTagId;
  const isCollectionView = Boolean(selectedFolderId);
  const mixedLibrary = !isSearchView && (isAllBookmarksView || isCollectionView);
  const sorting = useMemo(() => ({
    ...sortPreference,
    order: sortPreference.order === "most-used" && isSearchView
      ? "default" as const
      : sortPreference.order.startsWith("favorited-") && (!isFavoritesView || isSearchView)
      ? "default" as const
      : sortPreference.order.startsWith("website-") && mixedLibrary && !sortPreference.bookmarksOnly
        ? "default" as const : sortPreference.order,
  }), [sortPreference, isFavoritesView, isSearchView, mixedLibrary]);
  const pageTitle = selectedSmartView
    ? selectedSmartView.name
    : smartViewId && (!smartViews.ready || smartViews.isLoading)
      ? "Loading Smart View…"
      : isSearchView
    ? "Search results"
    : isFavoritesView
      ? "Favorites"
      : isUnsortedView
        ? "Unsorted"
        : selectedTagId
          ? `#${loadingTags ? "" : (selectedTagName ?? selectedTagId)}`
          : (selectedFolderName ?? "Library");
  const pageDescription = selectedSmartView
    ? "Saved Smart View · Results update as your library changes"
    : isSearchView
    ? normalizedBookmarkSearch
      ? `Across your entire library for “${normalizedBookmarkSearch}”`
      : "Across your entire library with the selected filters"
    : isAllBookmarksView
      ? "Everything you have saved, in one private workspace"
      : isFavoritesView
        ? "The links you want to keep close"
        : isUnsortedView
          ? "Links that are waiting for a collection"
          : "Everything saved in this collection";

  const bookmarkIndexStatus = useMemo(() => {
    if (bookmarkCacheSyncing) {
      return bookmarkCacheSyncedAt ? "Updating index..." : "Indexing...";
    }
    if (!bookmarkCacheSyncedAt) return "Index not built yet";

    const elapsedMs = currentTime - new Date(bookmarkCacheSyncedAt).getTime();
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    if (elapsedMinutes <= 0) return "Indexed just now";
    if (elapsedMinutes < 60) return `Indexed ${elapsedMinutes}m ago`;
    const hours = Math.floor(elapsedMinutes / 60);
    return `Indexed ${hours}h ago`;
  }, [bookmarkCacheSyncing, bookmarkCacheSyncedAt, currentTime]);

  const shouldLoadCollectionEntries =
    isAllBookmarksView || isCollectionView || isSearchView;
  const readspaceQuery = useReadspace(
    !isLocalAccount &&
      (isAllBookmarksView || isCollectionView || isSearchView),
  );
  const deleteReadspaceEntry = useDeleteReadspaceEntry();
  const readspaceArticles = useMemo(
    () =>
      (readspaceQuery.data ?? []).flatMap((entry) => {
        const content = parseReadspaceContent(entry.content);
        return content ? [{ entry, content }] : [];
      }),
    [readspaceQuery.data],
  );
  const readspaceSearchQuery = useReadspaceFullTextSearch(
    readspaceArticles,
    normalizedBookmarkSearch,
    100,
    fullTextSearchEnabled,
    !isLocalAccount,
    searchFilters,
  );
  const readspaceSearchResult = readspaceSearchQuery.data ?? {
    matches: [],
    total: 0,
  };
  const highlightSearchMatches = useMemo(
    () => searchHighlights(
      highlightsQuery.data ?? [],
      highlightSourceBookmarksQuery.data ?? cachedBookmarks,
      readspaceArticles,
      normalizedBookmarkSearch,
      { includeAnnotations: fullTextSearchEnabled, filters: searchFilters },
    ),
    [
      cachedBookmarks,
      fullTextSearchEnabled,
      searchFilters,
      highlightSourceBookmarksQuery.data,
      highlightsQuery.data,
      normalizedBookmarkSearch,
      readspaceArticles,
    ],
  );
  const notesQuery = useNotes({
    enabled: shouldLoadCollectionEntries,
  });
  const noteSearchMatches = useMemo(
    () =>
      searchNotes(notesQuery.data ?? [], normalizedBookmarkSearch, {
        includeContent: fullTextSearchEnabled, filters: searchFilters,
      }),
    [notesQuery.data, normalizedBookmarkSearch, fullTextSearchEnabled, searchFilters],
  );
  const todosQuery = useTodos({
    enabled: shouldLoadCollectionEntries,
  });
  const todoSearchMatches = useMemo(
    () =>
      searchTodos(todosQuery.data ?? [], normalizedBookmarkSearch, {
        includeContent: fullTextSearchEnabled, filters: searchFilters,
      }),
    [normalizedBookmarkSearch, todosQuery.data, fullTextSearchEnabled, searchFilters],
  );
  const collectionNotes = useMemo(
    () =>
      selectedFolderId
        ? (notesQuery.data ?? []).filter(
            (note) => note.folder?.id === selectedFolderId,
          )
        : [],
    [notesQuery.data, selectedFolderId],
  );
  const collectionTodos = useMemo(
    () =>
      selectedFolderId
        ? (todosQuery.data ?? []).filter(
            (todo) => todo.folder?.id === selectedFolderId,
          )
        : [],
    [todosQuery.data, selectedFolderId],
  );
  const collectionArticles = useMemo(
    () =>
      selectedFolderId
        ? readspaceArticles.filter(
            ({ entry }) => entry.folder?.id === selectedFolderId,
          )
        : [],
    [readspaceArticles, selectedFolderId],
  );
  const bookmarkSearchStatus = useMemo(() => {
    if (!isSearchView) {
      return fullTextSearchEnabled
        ? `${bookmarkIndexStatus} · Full-content search is on`
        : bookmarkIndexStatus;
    }
    if (
      bookmarkSearchLoading ||
      notesQuery.isLoading ||
      todosQuery.isLoading ||
      (!isLocalAccount && (
        readspaceQuery.isLoading ||
        readspaceSearchQuery.isLoading ||
        highlightsQuery.isLoading ||
        highlightSourceBookmarksQuery.isLoading
      ))
    ) {
      return isLocalAccount
        ? "Searching bookmarks, documents, and tasks..."
        : "Searching bookmarks, documents, tasks, Readspace, and highlights...";
    }
    const bookmarkLabel = `${bookmarkSearchResults} ${
      bookmarkSearchResults === 1 ? "bookmark" : "bookmarks"
    }`;
    const noteLabel = `${noteSearchMatches.length} ${
      noteSearchMatches.length === 1 ? "document" : "documents"
    }`;
    const todoLabel = `${todoSearchMatches.length} ${
      todoSearchMatches.length === 1 ? "task" : "tasks"
    }`;
    const readspaceLabel = `${readspaceSearchResult.total} ${
      readspaceSearchResult.total === 1 ? "article" : "articles"
    }`;
    const highlightLabel = `${highlightSearchMatches.length} ${
      highlightSearchMatches.length === 1 ? "highlight" : "highlights"
    }`;
    const context = normalizedBookmarkSearch ? ` for \u201c${normalizedBookmarkSearch}\u201d` : " matching filters";
    return isLocalAccount
      ? `${bookmarkLabel} · ${noteLabel} · ${todoLabel}${context}`
      : `${bookmarkLabel} · ${noteLabel} · ${todoLabel} · ${readspaceLabel} · ${highlightLabel}${context}`;
  }, [
    normalizedBookmarkSearch,
    isSearchView,
    bookmarkIndexStatus,
    fullTextSearchEnabled,
    bookmarkSearchLoading,
    bookmarkSearchResults,
    highlightSearchMatches.length,
    highlightSourceBookmarksQuery.isLoading,
    highlightsQuery.isLoading,
    isLocalAccount,
    noteSearchMatches.length,
    notesQuery.isLoading,
    readspaceQuery.isLoading,
    readspaceSearchQuery.isLoading,
    readspaceSearchResult.total,
    todoSearchMatches.length,
    todosQuery.isLoading,
  ]);

  const openCreateNote = () => {
    setEditingNote(null);
    setNoteEditorOpen(true);
  };

  const openEditNote = (note: Note) => {
    setEditingNote(note);
    setNoteEditorOpen(true);
  };

  const closeNoteEditor = () => {
    setNoteEditorOpen(false);
    setEditingNote(null);
  };

  const openCreateTodo = () => {
    setEditingTodo(null);
    setTodoEditorOpen(true);
  };

  const openEditTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setTodoEditorOpen(true);
  };

  const closeTodoEditor = () => {
    setTodoEditorOpen(false);
    setEditingTodo(null);
  };

  const confirmDeleteArticle = async () => {
    if (!deleteTarget) return;
    setDeleteArticleError(null);
    try {
      await deleteReadspaceEntry.mutateAsync(deleteTarget.entry.id);
      setDeleteTarget(null);
    } catch (caughtError) {
      setDeleteArticleError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not delete this article.",
      );
    }
  };

  const dashboardIconButtonClass = "theme-button-icon inline-flex";

  return (
    <div className="w-full min-w-0 flex-1 space-y-4 lg:space-y-5">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="w-full py-1 sm:py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 lg:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className={`lg:hidden -ml-2 size-11 ${dashboardIconButtonClass}`}
                  aria-label="Open navigation"
                >
                  <Menu size={20} aria-hidden="true" />
                </button>
                <h1 className="min-w-0 truncate text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">
                  {pageTitle}
                </h1>
                {selectedSmartView ? (
                  <SmartViewHeaderActions key={selectedSmartView.id}
                    view={selectedSmartView} canEdit={accountPlan?.id === "pro"}
                    onDeleted={() => navigate("/")} />
                ) : !isSearchView && selectedFolderId && selectedFolder ? (
                  <CollectionHeaderActions
                    folder={selectedFolder}
                    onDeleted={() => navigate("/")}
                    onRenamed={(folderId, nextName) => {
                      const nextFolders = folders.map((folder) =>
                        folder.id === folderId
                          ? { ...folder, name: nextName }
                          : folder,
                      );
                      const nextCollectionSlugIndex =
                        buildCollectionSlugIndex(nextFolders);
                      const nextSlug =
                        nextCollectionSlugIndex.slugById.get(folderId);
                      if (!nextSlug) return;
                      navigate(`/c/${nextSlug}`, { replace: true });
                    }}
                  />
                ) : !isSearchView && selectedTagId && selectedTag ? (
                  <TagHeaderActions
                    tag={selectedTag}
                    onDeleted={() => navigate("/")}
                    onRenamed={(tagId, nextName) => {
                      const nextTags = tags.map((tag) =>
                        tag.id === tagId ? { ...tag, name: nextName } : tag,
                      );
                      const nextTagSlugIndex = buildTagSlugIndex(nextTags);
                      const nextSlug = nextTagSlugIndex.slugById.get(tagId);
                      if (!nextSlug) return;
                      navigate(`/t/${nextSlug}`, { replace: true });
                    }}
                  />
                ) : null}
              </div>
              <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
                {pageDescription}
              </p>
            </div>

            <div className="col-start-2 row-start-1 flex items-center gap-2 self-start lg:col-start-auto lg:row-start-auto lg:self-auto lg:justify-self-end">
              {isSearchView ? null : isAllBookmarksView ? (
                <HomeAddMenu
                  onAddBookmark={() => openAddBookmark(null)}
                  onAddNote={openCreateNote}
                  onAddTodo={openCreateTodo}
                />
              ) : (
                <AddBookmarkButton
                  onClick={() => openAddBookmark(selectedFolderId)}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <SearchCommandBar
        inputRef={bookmarkSearchInputRef}
        onEngineChange={(engine) => updateSearchEngine.mutate(engine.slug)}
        searchHistory={searchHistory.searches}
        onSearchSubmitted={searchHistory.addSearch}
        filters={searchFilters}
        onFiltersChange={(filters) => {
          if (smartViewId) { detachingSmartView.current = true; navigate("/", { replace: true }); }
          setSearchFilters(filters);
        }}
        onQueryChange={() => { if (smartViewId) { detachingSmartView.current = true; navigate("/", { replace: true }); } }}
        canSaveSmartView={!isLocalAccount && accountPlan?.id === "pro"}
        onSaveSmartView={() => setSaveSmartViewOpen(true)}
        folders={folders}
        tags={tags}
        isLocalAccount={isLocalAccount}
        bookmarkSearchStatus={bookmarkSearchStatus}
        bookmarkSearchError={
          bookmarkCacheError ??
          (notesQuery.error instanceof Error
            ? notesQuery.error.message
            : notesQuery.error
              ? "Could not search documents."
              : todosQuery.error instanceof Error
                ? todosQuery.error.message
                : todosQuery.error
                  ? "Could not search tasks."
                  : readspaceQuery.error instanceof Error
                    ? readspaceQuery.error.message
                    : readspaceQuery.error
                      ? "Could not search Readspace."
                      : readspaceSearchQuery.error instanceof Error
                        ? readspaceSearchQuery.error.message
                        : readspaceSearchQuery.error
                          ? "Could not search Readspace article text."
                          : highlightsQuery.error instanceof Error
                            ? highlightsQuery.error.message
                            : highlightsQuery.error
                              ? "Could not search highlights."
                              : highlightSourceBookmarksQuery.error instanceof Error
                                ? highlightSourceBookmarksQuery.error.message
                                : highlightSourceBookmarksQuery.error
                                  ? "Could not load highlight sources."
                                  : null)
        }
        onRetryBookmarkSearch={() => {
          retryBookmarkCacheSync();
          void notesQuery.refetch();
          void todosQuery.refetch();
          if (!isLocalAccount) {
            void readspaceQuery.refetch();
            void readspaceSearchQuery.refetch();
            void highlightsQuery.refetch();
            void highlightSourceBookmarksQuery.refetch();
          }
        }}
      />
      <SaveSmartViewDialog open={saveSmartViewOpen} onClose={() => setSaveSmartViewOpen(false)}
        query={searchQuery} filters={searchFilters} />
      {smartViewId && smartViews.error ? <div role="alert" className="mx-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 lg:mx-0">
        Could not load this Saved Smart View. <button type="button" className="font-semibold underline" onClick={() => void smartViews.refetch()}>Retry</button>
      </div> : null}

      <div className="flex flex-wrap items-start justify-between gap-2 px-3 lg:px-0">
        <div className="min-w-0 flex-1"><BookmarkSortControl
          disabled={sortSync.busy}
          value={sorting}
          onChange={setSortPreference}
          mixedLibrary={mixedLibrary}
          favorites={isFavoritesView && !isSearchView}
          search={isSearchView}
        /></div>
        <LibraryLayoutControl layout={layout} onChange={setLayout} />
      </div>

      {isSearchView ? (
        <div
          className="space-y-3 px-3 lg:px-0"
          aria-label={isLocalAccount
            ? "Search results from documents and tasks"
            : "Search results from documents, tasks, articles, and highlights"}
        >
          <NoteSearchResults
            layout={layout}
            matches={noteSearchMatches}
            query={normalizedBookmarkSearch}
            refined={hasRefinedLibrarySearch(searchFilters)}
          />
          <TodoSearchResults
            layout={layout}
            matches={todoSearchMatches}
            query={normalizedBookmarkSearch}
            refined={hasRefinedLibrarySearch(searchFilters)}
          />
          {!isLocalAccount ? (
            <>
              <ReadspaceSearchResults
                layout={layout}
                result={readspaceSearchResult}
                query={normalizedBookmarkSearch}
                refined={hasRefinedLibrarySearch(searchFilters)}
              />
              <HighlightSearchResults
                layout={layout}
                matches={highlightSearchMatches}
                query={normalizedBookmarkSearch}
                refined={hasRefinedLibrarySearch(searchFilters)}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {sortSync.error && (
        <div role="alert" className="px-3 text-sm text-red-600 dark:text-red-300 lg:px-0">
          {sortSync.error.message}
          <Button plain onClick={sortSync.reload}>Reload cloud settings</Button>
        </div>
      )}
      {sorting.order === "most-used" && usageQuery.error && (
        <div role="alert" className="px-3 text-sm text-red-600 dark:text-red-300 lg:px-0">
          Could not load bookmark usage. <Button plain onClick={() => void usageQuery.refetch()}>Try again</Button>
        </div>
      )}
      {isAllBookmarksView && !isSearchView ? (
        <HomeLibraryGrid
          layout={layout}
          key={user?.id}
          sorting={sorting}
          bookmarksOnly={sorting.bookmarksOnly}
          bookmarks={rankedBookmarks}
          notes={notesQuery.data ?? []}
          todos={todosQuery.data ?? []}
          articles={readspaceArticles}
          isLoading={
            (sorting.order === "most-used" && usageQuery.isPending) ||
            cachedBookmarksQuery.isPending ||
            (bookmarkCacheSyncing && !bookmarkCacheSyncedAt) ||
            notesQuery.isLoading ||
            todosQuery.isLoading ||
            readspaceQuery.isLoading
          }
          error={
            bookmarkCacheError ??
            (cachedBookmarksQuery.error instanceof Error
              ? cachedBookmarksQuery.error.message
              : cachedBookmarksQuery.error
                ? "Could not load bookmarks."
                : notesQuery.error instanceof Error
                  ? notesQuery.error.message
                  : notesQuery.error
                    ? "Could not load documents."
                    : todosQuery.error instanceof Error
                      ? todosQuery.error.message
                      : todosQuery.error
                        ? "Could not load tasks."
                        : readspaceQuery.error instanceof Error
                          ? readspaceQuery.error.message
                          : readspaceQuery.error
                            ? "Could not load Readspace articles."
                            : null)
          }
          onRetry={() => {
            retryBookmarkCacheSync();
            void cachedBookmarksQuery.refetch();
            void notesQuery.refetch();
            void todosQuery.refetch();
            void readspaceQuery.refetch();
          }}
          onAddBookmark={() => openAddBookmark(null)}
          onAddNote={openCreateNote}
          onAddTodo={openCreateTodo}
          onEditNote={openEditNote}
          onEditTodo={openEditTodo}
          onOpenArticle={openSavedArticle}
          onOrganizeArticle={setOrganizeTarget}
          onDeleteArticle={(article) => {
            setDeleteArticleError(null);
            setDeleteTarget(article);
          }}
        />
      ) : isCollectionView && selectedFolderId && !isSearchView ? (
        <CollectionLibraryGrid
          layout={layout}
          key={user?.id}
          sorting={sorting}
          bookmarksOnly={sorting.bookmarksOnly}
          folderId={selectedFolderId}
          bookmarks={rankedBookmarks}
          bookmarksLoading={
            (sorting.order === "most-used" && usageQuery.isPending) ||
            cachedBookmarksQuery.isPending ||
            (bookmarkCacheSyncing && !bookmarkCacheSyncedAt)
          }
          bookmarksError={
            bookmarkCacheError ??
            (cachedBookmarksQuery.error instanceof Error
              ? cachedBookmarksQuery.error.message
              : cachedBookmarksQuery.error
                ? "Could not load bookmarks."
                : null)
          }
          onRetryBookmarks={() => {
            retryBookmarkCacheSync();
            void cachedBookmarksQuery.refetch();
          }}
          notes={collectionNotes}
          todos={collectionTodos}
          articles={collectionArticles}
          entriesLoading={
            notesQuery.isLoading ||
            todosQuery.isLoading ||
            readspaceQuery.isLoading
          }
          entriesError={
            notesQuery.error instanceof Error
              ? notesQuery.error.message
              : notesQuery.error
                ? "Could not load documents."
                : todosQuery.error instanceof Error
                  ? todosQuery.error.message
                  : todosQuery.error
                    ? "Could not load tasks."
                    : readspaceQuery.error instanceof Error
                      ? readspaceQuery.error.message
                      : readspaceQuery.error
                        ? "Could not load Readspace articles."
                        : null
          }
          onRetryEntries={() => {
            void notesQuery.refetch();
            void todosQuery.refetch();
            void readspaceQuery.refetch();
          }}
          onAddBookmark={() => openAddBookmark(selectedFolderId)}
          onEditNote={openEditNote}
          onEditTodo={openEditTodo}
          onOpenArticle={openSavedArticle}
          onOrganizeArticle={setOrganizeTarget}
          onDeleteArticle={(article) => {
            setDeleteArticleError(null);
            setDeleteTarget(article);
          }}
        />
      ) : (
        <section className="px-3 lg:px-0">
          <BookmarkList
            layout={layout}
            key={user?.id}
            sorting={sorting}
            bookmarks={rankedBookmarks}
            bookmarksLoading={
              (sorting.order === "most-used" && usageQuery.isPending) ||
              cachedBookmarksQuery.isPending ||
              (bookmarkCacheSyncing && !bookmarkCacheSyncedAt)
            }
            bookmarksError={bookmarkCacheError ?? cachedBookmarksQuery.error}
            onRetryBookmarks={() => {
              retryBookmarkCacheSync();
              void cachedBookmarksQuery.refetch();
            }}
            onRefresh={retryBookmarkCacheSync}
            folderId={selectedTagId ? null : effectiveFolderId}
            tagId={selectedTagId}
            searchQuery={debouncedBookmarkSearch}
            searchFilters={searchFilters}
            searchShortcutsEnabled={
              userInfo?.bookmark_search_shortcuts_enabled !== false
            }
            onAddBookmark={() => openAddBookmark(selectedFolderId)}
            onSearchMetaChange={(meta) => {
              setBookmarkSearchLoading(meta.isLoading);
              setBookmarkSearchResults(meta.count);
            }}
          />
        </section>
      )}

      <NoteEditorDialog
        open={noteEditorOpen}
        note={editingNote}
        onClose={closeNoteEditor}
      />
      <TodoEditorDialog
        open={todoEditorOpen}
        todo={editingTodo}
        onClose={closeTodoEditor}
      />
      <ReadspaceArticleDialog
        article={readTarget}
        onClose={() => setReadTarget(null)}
      />
      <ReadspaceOrganizationDialog
        article={organizeTarget?.entry ?? null}
        onClose={() => setOrganizeTarget(null)}
      />
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        size="sm"
      >
        <DialogTitle>Move saved article to Trash?</DialogTitle>
        <DialogDescription>
          “{deleteTarget?.entry.title ?? "This article"}” can be restored from
          Trash before its recovery period expires.
        </DialogDescription>
        {deleteArticleError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">
            {deleteArticleError}
          </p>
        ) : null}
        <DialogActions>
          <Button
            type="button"
            plain
            onClick={() => setDeleteTarget(null)}
            disabled={deleteReadspaceEntry.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            color="red"
            disabled={deleteReadspaceEntry.isPending}
            onClick={() => void confirmDeleteArticle()}
          >
            {deleteReadspaceEntry.isPending ? "Deleting…" : "Move to Trash"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
