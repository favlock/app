import type { NoteSearchMatch } from "../lib/noteSearch";
import EntrySearchResults from "./EntrySearchResults";

interface NoteSearchResultsProps {
  matches: NoteSearchMatch[];
  query: string;
  refined?: boolean;
}

export default function NoteSearchResults({
  matches,
  query,
  refined,
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
      refined={refined}
    />
  );
}
