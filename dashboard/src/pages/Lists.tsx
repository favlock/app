import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  ListChecks,
  Menu,
  Pencil,
  Plus,
  Trash2,
  Youtube,
} from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import ProUpgradeDialog from "../components/ProUpgradeDialog";
import { Button } from "../components/ui/button";
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from "../components/ui/combobox";
import {
  useAddBookmarkToList,
  useCreateList,
  useDeleteList,
  useLists,
  useRemoveListItem,
  useRenameList,
  useReorderListItems,
  useToggleListItem,
} from "../hooks/useListsQuery";
import { useBookmarks } from "../hooks/useBookmarksQuery";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { getMainDomain } from "../lib/domains";
import {
  getListProgress,
  hasReachedListLimit,
  moveListItem,
} from "../lib/lists";
import type { Bookmark, BookmarkList } from "../types/bookmark";
import type { DashboardLayoutContext } from "./DashboardLayout";

const EMPTY_LISTS: BookmarkList[] = [];
const EMPTY_BOOKMARKS: Bookmark[] = [];

function isYouTubeUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "youtube.com" || hostname === "youtu.be";
  } catch {
    return false;
  }
}

export default function Lists() {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const listsQuery = useLists();
  const { data: accountPlan } = useAccountPlan();
  const createList = useCreateList();
  const renameList = useRenameList();
  const deleteList = useDeleteList();
  const toggleItem = useToggleListItem();
  const removeItem = useRemoveListItem();
  const reorderItems = useReorderListItems();
  const addBookmarkToList = useAddBookmarkToList();
  const lists = listsQuery.data ?? EMPTY_LISTS;
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BookmarkList | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const bookmarksQuery = useBookmarks(null, { enabled: addingItem });
  const bookmarks = bookmarksQuery.data ?? EMPTY_BOOKMARKS;

  useEffect(() => {
    if (!lists.length) {
      setSelectedListId(null);
      return;
    }
    if (!lists.some((list) => list.id === selectedListId)) {
      setSelectedListId(lists[0].id);
    }
  }, [lists, selectedListId]);

  const selectedList = useMemo(
    () => lists.find((list) => list.id === selectedListId) ?? null,
    [lists, selectedListId],
  );
  const progress = getListProgress(selectedList?.items ?? []);
  const listLimitReached = accountPlan
    ? hasReachedListLimit(lists.length, accountPlan.limits.lists)
    : false;
  const availableBookmarks = useMemo(() => {
    if (!selectedList) return EMPTY_BOOKMARKS;
    const currentIds = new Set(
      selectedList.items.map((item) => item.bookmark.id),
    );
    return bookmarks.filter((bookmark) => !currentIds.has(bookmark.id));
  }, [bookmarks, selectedList]);

  useEffect(() => {
    setAddingItem(false);
    setSelectedBookmark(null);
  }, [selectedListId]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const listId = await createList.mutateAsync(newName);
      setSelectedListId(listId);
      setNewName("");
      setCreating(false);
    } catch (caughtError) {
      if (
        caughtError instanceof Error &&
        caughtError.message.includes("List limit reached")
      ) {
        setCreating(false);
        setUpgradeDialogOpen(true);
        return;
      }
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not create the List.",
      );
    }
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedList) return;
    setError(null);
    try {
      await renameList.mutateAsync({ listId: selectedList.id, name: nameDraft });
      setEditingName(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not rename the List.",
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await deleteList.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not delete the List.",
      );
    }
  };

  const move = async (bookmarkId: string, direction: "up" | "down") => {
    if (!selectedList) return;
    const currentIds = selectedList.items.map((item) => item.bookmark.id);
    const bookmarkIds = moveListItem(currentIds, bookmarkId, direction);
    if (bookmarkIds === currentIds) return;
    setError(null);
    try {
      await reorderItems.mutateAsync({ listId: selectedList.id, bookmarkIds });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not reorder the List.",
      );
    }
  };

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedList || !selectedBookmark) return;
    setError(null);
    try {
      await addBookmarkToList.mutateAsync({
        listId: selectedList.id,
        bookmarkId: selectedBookmark.id,
      });
      setSelectedBookmark(null);
      setAddingItem(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not add the item.",
      );
    }
  };

  return (
    <div className="w-full min-w-0 flex-1 space-y-4 lg:space-y-5">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="flex items-start justify-between gap-4 py-1 sm:py-2">
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
                Lists
              </h1>
              <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
                Put videos and articles in order, then track your progress.
              </p>
            </div>
          </div>
          <Button
            type="button"
            color="emerald"
            onClick={() => {
              if (listLimitReached) {
                setUpgradeDialogOpen(true);
              } else {
                setCreating(true);
              }
            }}
          >
            <Plus data-slot="icon" aria-hidden="true" />
            New List
          </Button>
        </div>
      </header>

      {error ? (
        <p className="mx-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 lg:mx-1" role="alert">
          {error}
        </p>
      ) : null}

      {creating ? (
        <form onSubmit={create} className="mx-4 flex gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[var(--app-card)] p-3 shadow-sm lg:mx-1">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="List name"
            maxLength={80}
            autoFocus
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)]"
          />
          <Button type="button" outline onClick={() => setCreating(false)}>Cancel</Button>
          <Button type="submit" color="emerald" disabled={createList.isPending}>Create</Button>
        </form>
      ) : null}

      <div className="grid gap-4 px-4 sm:px-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-1">
        <aside className="rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[var(--app-card)] p-2 shadow-sm">
          {listsQuery.isLoading ? (
            <p className="px-3 py-4 text-sm text-[var(--app-muted)]">Loading Lists…</p>
          ) : listsQuery.error ? (
            <button type="button" className="w-full rounded-xl px-3 py-4 text-left text-sm text-red-600" onClick={() => void listsQuery.refetch()}>
              Could not load Lists. Try again.
            </button>
          ) : lists.length ? (
            <ul className="space-y-1">
              {lists.map((list) => {
                const listProgress = getListProgress(list.items);
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedListId(list.id);
                        setEditingName(false);
                        setError(null);
                      }}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition ${selectedListId === list.id ? "bg-[var(--app-primary)] text-white shadow-sm" : "hover:bg-[var(--app-card-strong)]"}`}
                    >
                      <span className="block truncate text-sm font-semibold">{list.name}</span>
                      <span className={`mt-1 block text-xs ${selectedListId === list.id ? "text-white/75" : "text-[var(--app-muted)]"}`}>
                        {listProgress.completed} of {listProgress.total} completed
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-8 text-center">
              <ListChecks className="mx-auto text-[var(--app-primary)]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">No Lists yet</p>
              <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">Create one here or from the FavLock extension.</p>
            </div>
          )}
        </aside>

        <section className="min-w-0 rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[var(--app-card)] p-4 shadow-sm sm:p-5">
          {selectedList ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editingName ? (
                    <form onSubmit={rename} className="flex max-w-lg gap-2">
                      <input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        maxLength={80}
                        autoFocus
                        className="min-h-10 min-w-0 flex-1 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)]"
                      />
                      <Button type="submit" color="emerald" disabled={renameList.isPending}>Save</Button>
                    </form>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-xl font-semibold text-[var(--app-ink)]">{selectedList.name}</h2>
                      <button
                        type="button"
                        className="theme-button-icon inline-flex size-9"
                        aria-label="Rename List"
                        onClick={() => {
                          setNameDraft(selectedList.name);
                          setEditingName(true);
                        }}
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  <p className="mt-1 text-sm text-[var(--app-muted)]">{progress.completed} of {progress.total} completed</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    outline
                    onClick={() => {
                      setAddingItem(true);
                      setSelectedBookmark(null);
                    }}
                  >
                    <Plus data-slot="icon" aria-hidden="true" />
                    Add item
                  </Button>
                  <button
                    type="button"
                    className="theme-button-icon inline-flex size-10 text-red-600"
                    aria-label="Delete List"
                    onClick={() => setDeleteTarget(selectedList)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--app-line)_10%,transparent)]" aria-label={`${progress.percentage}% complete`}>
                <div className="h-full rounded-full bg-[var(--app-primary)] transition-[width]" style={{ width: `${progress.percentage}%` }} />
              </div>

              {addingItem ? (
                <form
                  onSubmit={addItem}
                  className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--app-primary)_18%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_6%,var(--app-card))] p-3"
                >
                  <label className="text-sm font-semibold text-[var(--app-ink)]">
                    Add an existing bookmark
                  </label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Combobox<Bookmark>
                      value={selectedBookmark ?? undefined}
                      onChange={setSelectedBookmark}
                      options={availableBookmarks}
                      displayValue={(bookmark) => bookmark?.title}
                      filter={(bookmark, query) => {
                        const search = query.trim().toLowerCase();
                        return `${bookmark.title} ${bookmark.url}`
                          .toLowerCase()
                          .includes(search);
                      }}
                      placeholder={
                        bookmarksQuery.isLoading
                          ? "Loading bookmarks..."
                          : availableBookmarks.length
                            ? "Search bookmarks..."
                            : "No bookmarks available"
                      }
                      disabled={bookmarksQuery.isLoading || !availableBookmarks.length}
                      className="min-w-0 flex-1"
                    >
                      {(bookmark) => (
                        <ComboboxOption value={bookmark}>
                          <ComboboxLabel>{bookmark.title}</ComboboxLabel>
                          <ComboboxDescription>
                            {getMainDomain(bookmark.url)}
                          </ComboboxDescription>
                        </ComboboxOption>
                      )}
                    </Combobox>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        outline
                        onClick={() => {
                          setAddingItem(false);
                          setSelectedBookmark(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        color="emerald"
                        disabled={!selectedBookmark || addBookmarkToList.isPending}
                      >
                        {addBookmarkToList.isPending ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  </div>
                </form>
              ) : null}

              {selectedList.items.length ? (
                <ol className="mt-5 space-y-2">
                  {selectedList.items.map((item, index) => {
                    const completed = !!item.completed_at;
                    const VideoIcon = isYouTubeUrl(item.bookmark.url) ? Youtube : FileText;
                    return (
                      <li key={item.bookmark.id} className="flex items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-white/55 p-3">
                        <button
                          type="button"
                          onClick={() => void toggleItem.mutateAsync({ listId: selectedList.id, bookmarkId: item.bookmark.id, completed: !completed }).catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Could not update progress."))}
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition ${completed ? "border-[var(--app-primary)] bg-[var(--app-primary)] text-white" : "border-[color-mix(in_oklab,var(--app-line)_25%,transparent)] text-transparent hover:border-[var(--app-primary)]"}`}
                          aria-label={completed ? `Mark ${item.bookmark.title} incomplete` : `Mark ${item.bookmark.title} complete`}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" />
                        </button>
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${isYouTubeUrl(item.bookmark.url) ? "bg-red-500/10 text-red-600" : "bg-sky-500/10 text-sky-700"}`}>
                          <VideoIcon size={17} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <a href={item.bookmark.url} target="_blank" rel="noreferrer" className={`block truncate text-sm font-semibold hover:text-[var(--app-primary)] ${completed ? "text-[var(--app-muted)] line-through" : "text-[var(--app-ink)]"}`}>
                            {item.bookmark.title}
                          </a>
                          <span className="mt-0.5 block truncate text-xs text-[var(--app-muted)]">{getMainDomain(item.bookmark.url)}</span>
                        </div>
                        <a href={item.bookmark.url} target="_blank" rel="noreferrer" className="theme-button-icon inline-flex size-9" aria-label={`Open ${item.bookmark.title}`}>
                          <ExternalLink size={15} aria-hidden="true" />
                        </a>
                        <div className="flex">
                          <button type="button" className="theme-button-icon inline-flex size-8" disabled={index === 0 || reorderItems.isPending} aria-label={`Move ${item.bookmark.title} up`} onClick={() => void move(item.bookmark.id, "up")}>
                            <ChevronUp size={15} aria-hidden="true" />
                          </button>
                          <button type="button" className="theme-button-icon inline-flex size-8" disabled={index === selectedList.items.length - 1 || reorderItems.isPending} aria-label={`Move ${item.bookmark.title} down`} onClick={() => void move(item.bookmark.id, "down")}>
                            <ChevronDown size={15} aria-hidden="true" />
                          </button>
                          <button type="button" className="theme-button-icon inline-flex size-8 text-red-600" aria-label={`Remove ${item.bookmark.title} from List`} onClick={() => void removeItem.mutateAsync({ listId: selectedList.id, bookmarkId: item.bookmark.id }).catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Could not remove the item."))}>
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-[color-mix(in_oklab,var(--app-line)_18%,transparent)] px-5 py-10 text-center">
                  <p className="font-semibold text-[var(--app-ink)]">This List is empty</p>
                  <p className="mt-1 text-sm text-[var(--app-muted)]">Add a video or article from the FavLock extension.</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <ListChecks size={30} className="text-[var(--app-primary)]" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold">Choose a List</h2>
              <p className="mt-1 max-w-sm text-sm text-[var(--app-muted)]">Lists keep videos and articles in order without changing their Collections.</p>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this List?"
        description={`“${deleteTarget?.name ?? "This List"}” will be deleted. Its bookmarks will stay in your library.`}
        confirmLabel="Delete List"
        busyLabel="Deleting…"
        busy={deleteList.isPending}
        error={error}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
      <ProUpgradeDialog
        open={upgradeDialogOpen}
        onClose={() => setUpgradeDialogOpen(false)}
      />
    </div>
  );
}
