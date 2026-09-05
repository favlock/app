import { useEffect, useMemo, useState } from "react";
import { Library, PlusIcon } from "lucide-react";
import {
  mergeHomeLibraryItems,
  type HomeReadspaceArticle,
} from "../lib/homeLibrary";
import type { Bookmark, Note, Todo } from "../types/bookmark";
import BookmarkCard from "./BookmarkCard";
import NoteCard from "./NoteCard";
import ReadspaceCard from "./ReadspaceCard";
import TodoCard from "./TodoCard";
import { Button } from "./ui/button";
import { bookmarksForView } from "../lib/bookmarkViews";

const INITIAL_VISIBLE_ITEMS = 24;
const LOAD_MORE_ITEMS = 24;

export default function CollectionLibraryGrid({
  folderId,
  bookmarks: cachedBookmarks,
  bookmarksLoading,
  bookmarksError,
  onRetryBookmarks,
  notes,
  todos,
  articles,
  entriesLoading,
  entriesError,
  onRetryEntries,
  onAddBookmark,
  onEditNote,
  onEditTodo,
  onOpenArticle,
  onOrganizeArticle,
  onDeleteArticle,
}: {
  folderId: string;
  bookmarks: Bookmark[];
  bookmarksLoading: boolean;
  bookmarksError?: string | null;
  onRetryBookmarks: () => void;
  notes: Note[];
  todos: Todo[];
  articles: HomeReadspaceArticle[];
  entriesLoading: boolean;
  entriesError?: string | null;
  onRetryEntries: () => void;
  onAddBookmark: () => void;
  onEditNote: (note: Note) => void;
  onEditTodo: (todo: Todo) => void;
  onOpenArticle: (article: HomeReadspaceArticle) => void;
  onOrganizeArticle: (article: HomeReadspaceArticle) => void;
  onDeleteArticle: (article: HomeReadspaceArticle) => void;
}) {
  const bookmarks = useMemo(
    () => bookmarksForView(cachedBookmarks, { kind: "folder", id: folderId }),
    [cachedBookmarks, folderId],
  );
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ITEMS);
  const items = useMemo(
    () => mergeHomeLibraryItems(bookmarks, notes, todos, articles),
    [articles, bookmarks, notes, todos],
  );
  const visibleItems = items.slice(0, visibleCount);
  const isLoading = bookmarksLoading || entriesLoading;
  const error = bookmarksError ?? entriesError;

  useEffect(() => setVisibleCount(INITIAL_VISIBLE_ITEMS), [folderId]);

  return (
    <section className="px-3 lg:px-0" aria-labelledby="collection-library-title">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Library
          size={17}
          className="text-[var(--app-primary)]"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3
            id="collection-library-title"
            className="text-base font-bold text-[var(--app-ink)]"
          >
            Collection library
          </h3>
          <p className="text-xs text-[var(--app-muted)]">
            {bookmarks.length}{" "}
            {bookmarks.length === 1 ? "bookmark" : "bookmarks"}
            {" · "}
            {notes.length} {notes.length === 1 ? "document" : "documents"}
            {" · "}
            {todos.length} {todos.length === 1 ? "task" : "tasks"}
            {" · "}
            {articles.length} {articles.length === 1 ? "article" : "articles"}
          </p>
        </div>
      </div>

      {error ? (
        <div
          className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-700"
          role="alert"
        >
          <p>{error}</p>
          <Button
            type="button"
            outline
            className="mt-3"
            onClick={() => {
              onRetryBookmarks();
              onRetryEntries();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {isLoading && items.length === 0 ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          role="status"
          aria-label="Loading collection library"
        >
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="min-h-44 animate-pulse rounded-xl border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-white/50"
            />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--app-line)_18%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_78%,white)] px-5 py-9 text-center">
          <Library
            size={34}
            className="mx-auto text-[var(--app-primary)]"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-lg font-bold text-[var(--app-ink)]">
            This collection is empty
          </h3>
          <p className="mt-1 text-sm text-[var(--app-muted)]">
            Add a bookmark or move an existing library item here.
          </p>
          <Button
            type="button"
            color="emerald"
            className="mt-4"
            onClick={onAddBookmark}
          >
            <PlusIcon data-slot="icon" aria-hidden="true" />
            Add bookmark
          </Button>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleItems.map((item) => (
              <li
                key={`${item.kind}:${item.id}`}
                className="relative h-full list-none"
              >
                {item.kind === "bookmark" ? (
                  <BookmarkCard
                    bookmark={item.bookmark}
                    onDeleted={() => {}}
                    onMoved={() => {}}
                  />
                ) : item.kind === "note" ? (
                  <NoteCard note={item.note} onEdit={onEditNote} />
                ) : item.kind === "todo" ? (
                  <TodoCard todo={item.todo} onEdit={onEditTodo} />
                ) : (
                  <ReadspaceCard
                    entry={item.article.entry}
                    content={item.article.content}
                    onOpen={() => onOpenArticle(item.article)}
                    onOrganize={() => onOrganizeArticle(item.article)}
                    onDelete={() => onDeleteArticle(item.article)}
                  />
                )}
              </li>
            ))}
          </ul>

          {visibleCount < items.length ? (
            <div className="flex justify-center pt-5">
              <Button
                type="button"
                outline
                className="library-show-more"
                onClick={() =>
                  setVisibleCount((current) => current + LOAD_MORE_ITEMS)
                }
              >
                <PlusIcon data-slot="icon" aria-hidden="true" />
                Show more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
