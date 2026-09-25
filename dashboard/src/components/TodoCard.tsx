import {
  useDeleteTodo,
  useToggleTodo,
} from "../hooks/useTodosQuery";
import { useUpdateEntryFolder } from "../hooks/useEntriesQuery";
import type { Todo } from "../types/bookmark";
import EntryCard from "./EntryCard";
import { useAuth } from "../context/useAuth";
import type { LibraryLayout } from "../hooks/useLibraryLayout";

interface TodoCardProps {
  todo: Todo;
  layout?: LibraryLayout;
  onEdit: (todo: Todo) => void;
  onToggle?: (todoId: string, isCompleted: boolean) => Promise<void>;
  togglePending?: boolean;
}

export default function TodoCard({ todo, onEdit, layout, onToggle, togglePending }: TodoCardProps) {
  const deleteTodo = useDeleteTodo();
  const toggleTodo = useToggleTodo();
  const updateFolder = useUpdateEntryFolder();
  const { isLocalAccount } = useAuth();

  return (
    <EntryCard
      layout={layout}
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
        onToggle ? onToggle(todo.id, isCompleted) : toggleTodo.mutateAsync({ todoId: todo.id, isCompleted })
      }
      togglePending={togglePending ?? toggleTodo.isPending}
      deletePermanently={isLocalAccount}
    />
  );
}
