import NoteCard from "../components/NoteCard";
import NoteEditorDialog from "../components/NoteEditorDialog";
import { useNotes } from "../hooks/useNotesQuery";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import EntriesPage from "./EntriesPage";

export default function Notes() {
  const { data: notes = [], isLoading, error, refetch } = useNotes();
  const { data: accountPlan } = useAccountPlan();

  return (
    <EntriesPage
      kind="note"
      entries={notes}
      fullTextSearchEnabled={accountPlan?.id === "pro"}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      renderCard={(note, onEdit) => (
        <NoteCard note={note} onEdit={onEdit} />
      )}
      renderEditor={({ open, entry, onClose }) => (
        <NoteEditorDialog open={open} note={entry} onClose={onClose} />
      )}
    />
  );
}
