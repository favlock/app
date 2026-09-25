import type { TodoSearchMatch } from "../lib/todoSearch";
import EntrySearchResults from "./EntrySearchResults";
import type { LibraryLayout } from "../hooks/useLibraryLayout";

interface TodoSearchResultsProps {
  matches: TodoSearchMatch[];
  query: string;
  refined?: boolean;
  layout?: LibraryLayout;
}

export default function TodoSearchResults({
  matches,
  query,
  refined,
  layout,
}: TodoSearchResultsProps) {
  return (
    <EntrySearchResults
      kind="todo"
      matches={matches.map(({ todo, excerpt, score }) => ({
        entry: todo,
        excerpt,
        score,
      }))}
      query={query}
      refined={refined}
      layout={layout}
    />
  );
}
