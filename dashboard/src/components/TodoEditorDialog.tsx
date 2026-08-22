import { useCreateTodo, useUpdateTodo } from "../hooks/useTodosQuery";
import type { Todo } from "../types/bookmark";
import EntryEditorDialog from "./EntryEditorDialog";

interface TodoEditorDialogProps {
  open: boolean;
  todo?: Todo | null;
  onClose: () => void;
}

export default function TodoEditorDialog({
  open,
  todo,
  onClose,
}: TodoEditorDialogProps) {
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();

  return (
    <EntryEditorDialog
      open={open}
      kind="todo"
      entry={todo}
      onClose={onClose}
      onCreate={(values) => createTodo.mutateAsync(values)}
      onUpdate={({ entryId, ...values }) =>
        updateTodo.mutateAsync({ todoId: entryId, ...values })
      }
    />
  );
}
