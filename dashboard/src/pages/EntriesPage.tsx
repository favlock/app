import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ListTodo, Menu, PlusIcon, Search, StickyNote, X } from "lucide-react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useDebounce } from "../hooks/useDebounce";
import { searchEntries } from "../lib/entrySearch";
import type { Entry, EntryKind } from "../types/bookmark";
import type { DashboardLayoutContext } from "./DashboardLayout";

type EntryFilter =
  | "all"
  | "open"
  | "today"
  | "upcoming"
  | "overdue"
  | "done";

const TODO_FILTERS: EntryFilter[] = [
  "all",
  "open",
  "today",
  "upcoming",
  "overdue",
  "done",
];

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface EntriesPageProps<TEntry extends Entry> {
  kind: EntryKind;
  entries: TEntry[];
  fullTextSearchEnabled: boolean;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  renderCard: (entry: TEntry, onEdit: (entry: TEntry) => void) => ReactNode;
  renderEditor: (options: {
    open: boolean;
    entry: TEntry | null;
    onClose: () => void;
  }) => ReactNode;
  isCompleted?: (entry: TEntry) => boolean;
  getDueDate?: (entry: TEntry) => string | null | undefined;
  quickAdd?: ReactNode;
  layout?: "grid" | "list";
}

export default function EntriesPage<TEntry extends Entry>({
  kind,
  entries,
  fullTextSearchEnabled,
  isLoading,
  error,
  onRetry,
  renderCard,
  renderEditor,
  isCompleted,
  getDueDate,
  quickAdd,
  layout = "grid",
}: EntriesPageProps<TEntry>) {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TEntry | null>(null);
  const isTodo = kind === "todo";
  const [todoSearchOpen, setTodoSearchOpen] = useState(false);
  const singular = isTodo ? "task" : "document";
  const plural = isTodo ? "tasks" : "documents";
  const title = isTodo ? "Tasks" : "Write";
  const Icon = isTodo ? ListTodo : StickyNote;
  const searchQuery = searchParams.get("q") ?? "";
  const filterParam = searchParams.get("filter");
  const filter: EntryFilter =
    isTodo && TODO_FILTERS.includes(filterParam as EntryFilter)
      ? (filterParam as EntryFilter)
      : isTodo
        ? "open"
        : "all";
  const debouncedSearchQuery = useDebounce(searchQuery, 120).trim();
  const today = localDateString();

  const searchedEntries = useMemo(
    () =>
      debouncedSearchQuery
        ? searchEntries(entries, debouncedSearchQuery, {
            includeContent: fullTextSearchEnabled,
          }).map(({ entry }) => entry)
        : entries,
    [debouncedSearchQuery, entries, fullTextSearchEnabled],
  );
  const visibleEntries = isCompleted
    ? searchedEntries
        .filter((entry) => {
          const completed = isCompleted(entry);
          const dueDate = getDueDate?.(entry) ?? null;
          if (filter === "all") return true;
          if (filter === "done") return completed;
          if (completed) return false;
          if (filter === "today") return dueDate === today;
          if (filter === "upcoming") return !!dueDate && dueDate > today;
          if (filter === "overdue") return !!dueDate && dueDate < today;
          return true;
        })
        .sort((left, right) => {
          const leftCompleted = isCompleted(left);
          const rightCompleted = isCompleted(right);
          if (leftCompleted !== rightCompleted) return leftCompleted ? 1 : -1;

          if (leftCompleted && rightCompleted) {
            const leftCompletedAt =
              "completed_at" in left && typeof left.completed_at === "string"
                ? left.completed_at
                : "";
            const rightCompletedAt =
              "completed_at" in right && typeof right.completed_at === "string"
                ? right.completed_at
                : "";
            return rightCompletedAt.localeCompare(leftCompletedAt);
          }

          const leftDueDate = getDueDate?.(left) ?? null;
          const rightDueDate = getDueDate?.(right) ?? null;
          if (leftDueDate && rightDueDate) {
            const dueOrder = leftDueDate.localeCompare(rightDueDate);
            if (dueOrder !== 0) return dueOrder;
          } else if (leftDueDate || rightDueDate) {
            return leftDueDate ? -1 : 1;
          }
          return right.created_at.localeCompare(left.created_at);
        })
    : searchedEntries;
  const openCount = isCompleted
    ? entries.filter((entry) => !isCompleted(entry)).length
    : 0;
  const doneCount = isCompleted ? entries.length - openCount : 0;
  const todayCount = isCompleted
    ? entries.filter(
        (entry) => !isCompleted(entry) && getDueDate?.(entry) === today,
      ).length
    : 0;
  const upcomingCount = isCompleted
    ? entries.filter((entry) => {
        const dueDate = getDueDate?.(entry);
        return !isCompleted(entry) && !!dueDate && dueDate > today;
      }).length
    : 0;
  const overdueCount = isCompleted
    ? entries.filter((entry) => {
        const dueDate = getDueDate?.(entry);
        return !isCompleted(entry) && !!dueDate && dueDate < today;
      }).length
    : 0;

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const isSlashShortcut =
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey;
      if (!isSlashShortcut) return;

      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.getAttribute("role") === "textbox");
      if (isEditable) return;

      event.preventDefault();
      if (isTodo) setTodoSearchOpen(true);
      window.setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 0);
    };

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [isTodo]);

  useEffect(() => {
    if (isTodo && searchQuery) setTodoSearchOpen(true);
  }, [isTodo, searchQuery]);

  useEffect(() => {
    const openEntryId = searchParams.get("open");
    if (!openEntryId || entries.length === 0) return;

    const entryToOpen = entries.find((entry) => entry.id === openEntryId);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("open");
    setSearchParams(nextSearchParams, { replace: true });
    if (!entryToOpen) return;

    setEditingEntry(entryToOpen);
    setEditorOpen(true);
  }, [entries, searchParams, setSearchParams]);

  const updateParams = (updates: { q?: string; filter?: EntryFilter }) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("open");
    if (updates.q !== undefined) {
      if (updates.q) nextSearchParams.set("q", updates.q);
      else nextSearchParams.delete("q");
    }
    if (isTodo && updates.filter !== undefined) {
      if (updates.filter === "open") nextSearchParams.delete("filter");
      else nextSearchParams.set("filter", updates.filter);
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  const openCreate = () => {
    setEditingEntry(null);
    setEditorOpen(true);
  };

  const openEdit = (entry: TEntry) => {
    setEditingEntry(entry);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingEntry(null);
  };

  return (
    <div className="w-full min-w-0 flex-1 space-y-4 lg:space-y-5">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="w-full py-1 sm:py-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:items-center">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu size={20} aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
                  {isTodo
                    ? "Keep next actions clear and easy to finish"
                    : "A space for your ideas and writing"}
                </p>
              </div>
            </div>

            <Button
              type="button"
              color="emerald"
              onClick={openCreate}
              aria-label={`New ${singular}`}
              className="min-h-11 gap-2 whitespace-nowrap"
            >
              <PlusIcon data-slot="icon" aria-hidden="true" />
              <span className="hidden sm:inline">New {singular}</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>
      </header>

      <section className="px-3 lg:px-0">
        <div className="app-surface rounded-[1.15rem] p-3 sm:p-4">
          {quickAdd}

          <div
            className={
              quickAdd
                ? "mt-4 border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] pt-4"
                : ""
            }
          >
            {isTodo ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    aria-label="Filter tasks"
                  >
                    {(
                      [
                        ["all", `All ${entries.length}`],
                        ["open", `Open ${openCount}`],
                        ["today", `Today ${todayCount}`],
                        ["upcoming", `Upcoming ${upcomingCount}`],
                        ["overdue", `Overdue ${overdueCount}`],
                        ["done", `Done ${doneCount}`],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateParams({ filter: value })}
                        aria-pressed={filter === value}
                        className={`min-h-10 flex-none rounded-full border px-3 text-xs font-semibold transition-colors ${
                          filter === value
                            ? "border-[var(--app-primary)] bg-[var(--app-primary)] text-white"
                            : "border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-white/70 text-[var(--app-muted)] hover:text-[var(--app-ink)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTodoSearchOpen((current) =>
                        searchQuery ? true : !current,
                      )
                    }
                    aria-expanded={todoSearchOpen}
                    className={`inline-flex min-h-10 flex-none items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      todoSearchOpen || searchQuery
                        ? "border-[color-mix(in_oklab,var(--app-primary)_30%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_10%,white)] text-[var(--app-primary)]"
                        : "border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-white/70 text-[var(--app-muted)] hover:text-[var(--app-ink)]"
                    }`}
                  >
                    <Search size={14} aria-hidden="true" />
                    Search
                    {searchQuery ? (
                      <span className="size-1.5 rounded-full bg-[var(--app-primary)]" />
                    ) : null}
                  </button>
                </div>

                {todoSearchOpen ? (
                  <div className="mt-3 flex min-h-12 items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,white)] px-3 shadow-sm focus-within:border-[color-mix(in_oklab,var(--app-primary)_38%,transparent)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_12%,transparent)]">
                    <Search
                      size={18}
                      className="flex-none text-[var(--app-muted)]"
                      aria-hidden="true"
                    />
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      onChange={(event) => updateParams({ q: event.target.value })}
                      placeholder={
                        fullTextSearchEnabled
                          ? "Search tasks and details..."
                          : "Search task titles, tags, and collections..."
                      }
                      aria-label={
                        fullTextSearchEnabled
                          ? "Search tasks and details"
                          : "Search task titles, tags, and collections"
                      }
                      className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[var(--app-ink)] outline-none placeholder:text-[var(--app-muted)] sm:text-base [&::-webkit-search-cancel-button]:hidden"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          updateParams({ q: "" });
                          searchInputRef.current?.focus();
                        }}
                        className="theme-button-icon inline-flex size-10 flex-none"
                        aria-label="Clear task search"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                    <span className="hidden flex-none rounded-md border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-white/70 px-1.5 py-0.5 text-xs font-medium text-[var(--app-muted)] sm:inline-flex">
                      /
                    </span>
                  </div>
                ) : null}

                <p
                  className="mt-2 px-1 text-xs text-[var(--app-muted)]"
                  role="status"
                  aria-live="polite"
                >
                  {debouncedSearchQuery
                    ? `${visibleEntries.length} matching “${debouncedSearchQuery}”`
                    : `${openCount} ${openCount === 1 ? "task" : "tasks"} left`}
                </p>
              </>
            ) : (
              <>
                <div className="flex min-h-12 items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_72%,white)] px-3 shadow-sm focus-within:border-[color-mix(in_oklab,var(--app-primary)_38%,transparent)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_12%,transparent)]">
                  <Search
                    size={18}
                    className="flex-none text-[var(--app-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(event) => updateParams({ q: event.target.value })}
                    placeholder="Search documents..."
                    aria-label="Search documents"
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[var(--app-ink)] outline-none placeholder:text-[var(--app-muted)] sm:text-base [&::-webkit-search-cancel-button]:hidden"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        updateParams({ q: "" });
                        searchInputRef.current?.focus();
                      }}
                      className="theme-button-icon inline-flex size-10 flex-none"
                      aria-label="Clear document search"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                  <span className="hidden flex-none rounded-md border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-white/70 px-1.5 py-0.5 text-xs font-medium text-[var(--app-muted)] sm:inline-flex">
                    /
                  </span>
                </div>
                <p
                  className="mt-1.5 px-1 text-xs text-[var(--app-muted)]"
                  role="status"
                  aria-live="polite"
                >
                  {debouncedSearchQuery
                    ? `${searchedEntries.length} ${searchedEntries.length === 1 ? "document" : "documents"} matching “${debouncedSearchQuery}”`
                    : fullTextSearchEnabled
                      ? "Search runs privately across every decrypted document."
                      : "Search titles, tags, and collections. Full-text search is a Pro feature."}
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="px-3 lg:px-0">
        {isLoading ? (
          <div
            className={
              layout === "list"
                ? "space-y-2"
                : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            }
            role="status"
            aria-label={`Loading ${plural}`}
          >
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className={`${layout === "list" ? "min-h-20" : isTodo ? "min-h-44" : "min-h-64"} animate-pulse rounded-xl border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-white/50`}
              />
            ))}
          </div>
        ) : error ? (
          <div
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-700"
            role="alert"
          >
            <p>
              {error instanceof Error
                ? error.message
                : `Could not load ${plural}.`}
            </p>
            <Button type="button" outline className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="relative isolate overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_88%,white)] px-5 py-12 text-center shadow-[0_6px_0_color-mix(in_oklab,var(--app-line)_9%,transparent)] sm:px-8 sm:py-16">
            <div className="mx-auto flex max-w-md flex-col items-center">
              <span
                className={`flex size-16 items-center justify-center rounded-2xl border border-[color-mix(in_oklab,var(--app-primary)_22%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_12%,var(--app-card))] text-[var(--app-primary)] ${
                  isTodo
                    ? ""
                    : "shadow-[0_5px_0_color-mix(in_oklab,var(--app-line)_10%,transparent)]"
                }`}
              >
                <Icon size={30} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-bold tracking-tight text-[var(--app-ink)] sm:text-2xl">
                {isTodo ? "Add your first task" : "Write your first document"}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--app-muted)] sm:text-base">
                {isTodo
                  ? "Capture the next action, organize it with collections and tags, then check it off."
                  : "Write ideas, drafts, and research with formatting that keeps them clear."}
              </p>
              <Button
                type="button"
                color="emerald"
                onClick={openCreate}
                className="mt-6 gap-2"
              >
                <PlusIcon data-slot="icon" aria-hidden="true" />
                Create a {singular}
              </Button>
            </div>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div
            className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_86%,white)] px-5 py-10 text-center shadow-[0_5px_0_color-mix(in_oklab,var(--app-line)_8%,transparent)]"
            role="status"
          >
            <Search
              size={34}
              className="mx-auto text-[var(--app-muted)]"
              aria-hidden="true"
            />
            <h3 className="mt-3 text-lg font-bold text-[var(--app-ink)]">
              {isTodo
                ? "No tasks here"
                : `No documents match “${debouncedSearchQuery}”`}
            </h3>
            <p className="mt-1 text-sm text-[var(--app-muted)]">
              {isTodo
                ? "Try another filter or a shorter search."
                : fullTextSearchEnabled
                  ? "Try fewer words or a phrase from the document."
                  : "Try fewer words from the title, tags, or collection."}
            </p>
            <Button
              type="button"
              outline
              className="mt-5"
              onClick={() => updateParams({ q: "", filter: "open" })}
            >
              {isTodo ? "Clear filters" : "Clear search"}
            </Button>
          </div>
        ) : (
          <ul
            className={
              layout === "list"
                ? "space-y-2"
                : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            }
          >
            {visibleEntries.map((entry) => (
              <li key={entry.id} className="list-none">
                {renderCard(entry, openEdit)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {renderEditor({
        open: editorOpen,
        entry: editingEntry,
        onClose: closeEditor,
      })}
    </div>
  );
}
