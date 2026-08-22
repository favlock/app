import { useCreateNote, useUpdateNote } from "../hooks/useNotesQuery";
import type { Note } from "../types/bookmark";
import EntryEditorDialog from "./EntryEditorDialog";

interface NoteEditorDialogProps {
  open: boolean;
  note?: Note | null;
  onClose: () => void;
}

export default function NoteEditorDialog({
  open,
  note,
  onClose,
}: NoteEditorDialogProps) {
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();

  return (
    <EntryEditorDialog
      open={open}
      kind="note"
      entry={note}
      onClose={onClose}
      onCreate={(values) => createNote.mutateAsync(values)}
      onUpdate={({ entryId, ...values }) =>
        updateNote.mutateAsync({ noteId: entryId, ...values })
      }
    />
  );
}
