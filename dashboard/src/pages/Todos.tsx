import { useEffect, useRef, useState } from "react";
import TodoEditorDialog from "../components/TodoEditorDialog";
import TodoListRow from "../components/TodoListRow";
import TodoQuickAdd from "../components/TodoQuickAdd";
import { useTodos, useToggleTodo } from "../hooks/useTodosQuery";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import EntriesPage from "./EntriesPage";

export default function Todos() {
  const { data: todos = [], isLoading, error, refetch } = useTodos();
  const { data: accountPlan } = useAccountPlan();
  const toggleTodo = useToggleTodo();
  const undoTimerRef = useRef<number | null>(null);
  const [undoNotice, setUndoNotice] = useState<{
    todoId: string;
    title: string;
  } | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const clearUndoNotice = () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    setUndoNotice(null);
  };

  useEffect(
    () => () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    },
    [],
  );

  const handleToggle = async (todoId: string, isCompleted: boolean) => {
    const todo = todos.find((entry) => entry.id === todoId);
    setUndoError(null);
    if (isCompleted && todo) {
      clearUndoNotice();
      setUndoNotice({ todoId, title: todo.title });
      undoTimerRef.current = window.setTimeout(clearUndoNotice, 6_000);
    } else if (undoNotice?.todoId === todoId) {
      clearUndoNotice();
    }

    try {
      await toggleTodo.mutateAsync({ todoId, isCompleted });
    } catch (caughtError) {
      if (isCompleted) clearUndoNotice();
      throw caughtError;
    }
  };

  const undoCompletion = async () => {
    if (!undoNotice) return;
    const todoId = undoNotice.todoId;
    clearUndoNotice();
    try {
      await toggleTodo.mutateAsync({ todoId, isCompleted: false });
    } catch (caughtError) {
      setUndoError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not reopen this task.",
      );
    }
  };

  return (
    <>
      <EntriesPage
        kind="todo"
        entries={todos}
        fullTextSearchEnabled={accountPlan?.id === "pro"}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isCompleted={(todo) => todo.is_completed}
        getDueDate={(todo) => todo.due_date}
        quickAdd={<TodoQuickAdd />}
        layout="list"
        renderCard={(todo, onEdit) => (
          <TodoListRow
            todo={todo}
            onEdit={onEdit}
            onToggle={handleToggle}
          />
        )}
        renderEditor={({ open, entry, onClose }) => (
          <TodoEditorDialog open={open} todo={entry} onClose={onClose} />
        )}
      />

      {undoNotice ? (
        <div
          className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_18%,transparent)] bg-[var(--app-ink)] px-4 py-3 text-sm text-white shadow-2xl"
          role="status"
        >
          <span className="min-w-0 flex-1 truncate">
            Completed “{undoNotice.title}”
          </span>
          <button
            type="button"
            onClick={() => void undoCompletion()}
            className="min-h-9 rounded-lg px-2 font-bold text-emerald-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Undo
          </button>
        </div>
      ) : null}

      {undoError ? (
        <div
          className="fixed inset-x-3 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-red-300 bg-red-700 px-4 py-3 text-sm text-white shadow-2xl"
          role="alert"
        >
          {undoError}
        </div>
      ) : null}
    </>
  );
}
