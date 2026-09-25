import { useDeleteNote } from "../hooks/useNotesQuery";
import { useUpdateEntryFolder } from "../hooks/useEntriesQuery";
import type { Note } from "../types/bookmark";
import EntryCard from "./EntryCard";
import { useAuth } from "../context/useAuth";
import type { LibraryLayout } from "../hooks/useLibraryLayout";

interface NoteCardProps {
  note: Note;
  layout?: LibraryLayout;
  onEdit: (note: Note) => void;
}

export default function NoteCard({ note, onEdit, layout }: NoteCardProps) {
  const deleteNote = useDeleteNote();
  const updateFolder = useUpdateEntryFolder();
  const { isLocalAccount } = useAuth();

  return (
    <EntryCard
      layout={layout}
      kind="note"
      entry={note}
      onEdit={onEdit}
      onDelete={() => deleteNote.mutateAsync(note.id)}
      deletePending={deleteNote.isPending}
      onMove={(folderId) =>
        updateFolder.mutateAsync({ entryId: note.id, kind: "note", folderId })
      }
      movePending={updateFolder.isPending}
      deletePermanently={isLocalAccount}
    />
  );
}
