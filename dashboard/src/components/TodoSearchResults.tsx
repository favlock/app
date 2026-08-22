import type { TodoSearchMatch } from "../lib/todoSearch";
import EntrySearchResults from "./EntrySearchResults";

interface TodoSearchResultsProps {
  matches: TodoSearchMatch[];
  query: string;
}

export default function TodoSearchResults({
  matches,
  query,
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
    />
  );
}
