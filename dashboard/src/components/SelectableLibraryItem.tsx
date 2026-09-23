import type { ReactNode } from "react";
import { LibrarySelectionContext } from "../context/LibrarySelectionContext";
import type { BookmarkSelection } from "./BookmarkBulkEditor";

export default function SelectableLibraryItem({ id, title, selection, children }: {
  id: string; title: string; selection: BookmarkSelection; children: ReactNode;
}) {
  return <LibrarySelectionContext.Provider value={selection.active ? {
    checked: selection.selected.has(id), disabled: selection.busy, title,
    toggle: (range) => selection.toggle(id, range),
  } : null}>{children}</LibrarySelectionContext.Provider>;
}
