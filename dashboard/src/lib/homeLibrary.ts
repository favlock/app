import type { ReadspaceContent } from "./readspaceContent";
import type { Bookmark, Note, ReadspaceEntry, Todo } from "../types/bookmark";

export type HomeReadspaceArticle = {
  entry: ReadspaceEntry;
  content: ReadspaceContent;
};

export type HomeLibraryItem =
  | {
      kind: "bookmark";
      id: string;
      sortDate: string;
      bookmark: Bookmark;
    }
  | {
      kind: "note";
      id: string;
      sortDate: string;
      note: Note;
    }
  | {
      kind: "todo";
      id: string;
      sortDate: string;
      todo: Todo;
    }
  | {
      kind: "read";
      id: string;
      sortDate: string;
      article: HomeReadspaceArticle;
    };

export function mergeHomeLibraryItems(
  bookmarks: Bookmark[],
  notes: Note[],
  todos: Todo[],
  articles: HomeReadspaceArticle[] = [],
): HomeLibraryItem[] {
  return [
    ...bookmarks.map(
      (bookmark) =>
        ({
          kind: "bookmark",
          id: bookmark.id,
          sortDate: bookmark.created_at,
          bookmark,
        }) satisfies HomeLibraryItem,
    ),
    ...notes.map(
      (note) =>
        ({
          kind: "note",
          id: note.id,
          sortDate: note.created_at,
          note,
        }) satisfies HomeLibraryItem,
    ),
    ...todos.map(
      (todo) =>
        ({
          kind: "todo",
          id: todo.id,
          sortDate: todo.created_at,
          todo,
        }) satisfies HomeLibraryItem,
    ),
    ...articles.map(
      (article) =>
        ({
          kind: "read",
          id: article.entry.id,
          sortDate: article.entry.created_at,
          article,
        }) satisfies HomeLibraryItem,
    ),
  ].sort((left, right) => {
    const dateOrder = right.sortDate.localeCompare(left.sortDate);
    if (dateOrder !== 0) return dateOrder;
    return `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`);
  });
}
