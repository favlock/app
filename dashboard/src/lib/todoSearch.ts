import type { Todo } from "../types/bookmark";
import { searchEntries, type EntrySearchOptions } from "./entrySearch";

export interface TodoSearchMatch {
  todo: Todo;
  excerpt: string;
  score: number;
}

export function searchTodos(
  todos: Todo[],
  query: string,
  options?: EntrySearchOptions,
): TodoSearchMatch[] {
  return searchEntries(todos, query, options).map(({ entry, excerpt, score }) => ({
    todo: entry,
    excerpt,
    score,
  }));
}
