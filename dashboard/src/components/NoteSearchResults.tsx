import type { NoteSearchMatch } from "../lib/noteSearch";
import EntrySearchResults from "./EntrySearchResults";
import type { LibraryLayout } from "../hooks/useLibraryLayout";

interface NoteSearchResultsProps {
  matches: NoteSearchMatch[];
  query: string;
  refined?: boolean;
  layout?: LibraryLayout;
}

export default function NoteSearchResults({
  matches,
  query,
  refined,
  layout,
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
      layout={layout}
    />
  );
}
