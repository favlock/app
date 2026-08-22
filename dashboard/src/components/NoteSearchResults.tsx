import type { NoteSearchMatch } from "../lib/noteSearch";
import EntrySearchResults from "./EntrySearchResults";

interface NoteSearchResultsProps {
  matches: NoteSearchMatch[];
  query: string;
}

export default function NoteSearchResults({
  matches,
  query,
}: NoteSearchResultsProps) {
  return (
    <EntrySearchResults
      kind="note"
      matches={matches.map(({ note, excerpt, score }) => ({
        entry: note,
        excerpt,
        score,
      }))}
      query={query}
    />
  );
}
