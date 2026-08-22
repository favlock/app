import type { Note } from "../types/bookmark";
import { searchEntries, type EntrySearchOptions } from "./entrySearch";

export interface NoteSearchMatch {
  note: Note;
  excerpt: string;
  score: number;
}

export function searchNotes(
  notes: Note[],
  query: string,
  options?: EntrySearchOptions,
): NoteSearchMatch[] {
  return searchEntries(notes, query, options).map(({ entry, excerpt, score }) => ({
    note: entry,
    excerpt,
    score,
  }));
}
