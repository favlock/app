import { useMemo, useState } from "react";
import { Library, PlusIcon } from "lucide-react";
import type { Bookmark, Note, Todo } from "../types/bookmark";
import {
  mergeHomeLibraryItems,
  type HomeReadspaceArticle,
} from "../lib/homeLibrary";
import BookmarkCard from "./BookmarkCard";
import NoteCard from "./NoteCard";
import ReadspaceCard from "./ReadspaceCard";
import TodoCard from "./TodoCard";
import HomeAddMenu from "./HomeAddMenu";
import { Button } from "./ui/button";

const INITIAL_VISIBLE_ITEMS = 24;
const LOAD_MORE_ITEMS = 24;

interface HomeLibraryGridProps {
  bookmarks: Bookmark[];
  notes: Note[];
  todos: Todo[];
  articles: HomeReadspaceArticle[];
  isLoading: boolean;
  error?: string | null;
  onRetry: () => void;
  onAddBookmark: () => void;
  onAddNote: () => void;
  onAddTodo: () => void;
  onEditNote: (note: Note) => void;
  onEditTodo: (todo: Todo) => void;
  onOpenArticle: (article: HomeReadspaceArticle) => void;
  onOrganizeArticle: (article: HomeReadspaceArticle) => void;
  onDeleteArticle: (article: HomeReadspaceArticle) => void;
}

export default function HomeLibraryGrid({
  bookmarks,
  notes,
  todos,
  articles,
  isLoading,
  error,
  onRetry,
  onAddBookmark,
  onAddNote,
  onAddTodo,
  onEditNote,
  onEditTodo,
  onOpenArticle,
  onOrganizeArticle,
  onDeleteArticle,
}: HomeLibraryGridProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ITEMS);
  const items = useMemo(
    () => mergeHomeLibraryItems(bookmarks, notes, todos, articles),
    [articles, bookmarks, notes, todos],
  );
  const visibleItems = items.slice(0, visibleCount);

  return (
    <section className="px-3 lg:px-0" aria-labelledby="home-library-title">
      <div className="mb-3 flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Library
              size={18}
              className="text-[var(--app-primary)]"
              aria-hidden="true"
            />
            <h2
              id="home-library-title"
              className="text-lg font-bold text-[var(--app-ink)]"
            >
              Recent items
            </h2>
          </div>
          <p className="mt-0.5 text-sm text-[var(--app-muted)]">
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
          <Button type="button" outline className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}

      {isLoading && items.length === 0 ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          role="status"
          aria-label="Loading library"
        >
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="min-h-48 animate-pulse rounded-xl border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-white/50"
            />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--app-line)_18%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_78%,white)] px-5 py-10 text-center">
          <span className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--app-primary)_11%,white)] text-[var(--app-primary)]">
            <Library size={26} aria-hidden="true" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-[var(--app-ink)]">
            Start your private library
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--app-muted)]">
            Save a useful link or article, capture a thought, or add a next
            action. They will appear here in chronological order.
          </p>
          <div className="mt-5 flex justify-center">
            <HomeAddMenu
              onAddBookmark={onAddBookmark}
              onAddNote={onAddNote}
              onAddTodo={onAddTodo}
            />
          </div>
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
