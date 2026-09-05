import {
  useDeleteTodo,
  useToggleTodo,
} from "../hooks/useTodosQuery";
import { useUpdateEntryFolder } from "../hooks/useEntriesQuery";
import type { Todo } from "../types/bookmark";
import EntryCard from "./EntryCard";
import { useAuth } from "../context/useAuth";

interface TodoCardProps {
  todo: Todo;
  onEdit: (todo: Todo) => void;
}

export default function TodoCard({ todo, onEdit }: TodoCardProps) {
  const deleteTodo = useDeleteTodo();
  const toggleTodo = useToggleTodo();
  const updateFolder = useUpdateEntryFolder();
  const { isLocalAccount } = useAuth();

  return (
    <EntryCard
      kind="todo"
      entry={todo}
      completed={todo.is_completed}
      onEdit={onEdit}
      onDelete={() => deleteTodo.mutateAsync(todo.id)}
      deletePending={deleteTodo.isPending}
      onMove={(folderId) =>
        updateFolder.mutateAsync({ entryId: todo.id, kind: "todo", folderId })
      }
      movePending={updateFolder.isPending}
      onToggle={(isCompleted) =>
        toggleTodo.mutateAsync({ todoId: todo.id, isCompleted })
      }
      togglePending={toggleTodo.isPending}
      deletePermanently={isLocalAccount}
    />
  );
}
