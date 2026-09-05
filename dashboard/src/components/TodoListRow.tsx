import { useState } from "react";
import {
  CalendarDays,
  Check,
  Circle,
  Pencil,
  Trash2,
} from "lucide-react";
import { useUpdateEntryFolder } from "../hooks/useEntriesQuery";
import { useDeleteTodo } from "../hooks/useTodosQuery";
import { getEntryText, sanitizeEntryHtml } from "../lib/entryContent";
import type { Todo } from "../types/bookmark";
import CollectionBadgeMenu from "./CollectionBadgeMenu";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { useAuth } from "../context/useAuth";

interface TodoListRowProps {
  todo: Todo;
  onEdit: (todo: Todo) => void;
  onToggle: (todoId: string, isCompleted: boolean) => Promise<unknown>;
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dueDateLabel(dueDate: string): {
  label: string;
  tone: "overdue" | "today" | "future";
} {
  const today = localDateString();
  if (dueDate < today) return { label: "Overdue", tone: "overdue" };
  if (dueDate === today) return { label: "Today", tone: "today" };

  const [year, month, day] = dueDate.split("-").map(Number);
  return {
    label: shortDateFormatter.format(new Date(year, month - 1, day)),
    tone: "future",
  };
}

export default function TodoListRow({
  todo,
  onEdit,
  onToggle,
}: TodoListRowProps) {
  const { isLocalAccount } = useAuth();
  const deleteTodo = useDeleteTodo();
  const updateFolder = useUpdateEntryFolder();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [togglePending, setTogglePending] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const preview = getEntryText(sanitizeEntryHtml(todo.content)).trim();
  const due = todo.due_date ? dueDateLabel(todo.due_date) : null;

  const toggle = async () => {
    setToggleError(null);
    setTogglePending(true);
    try {
      await onToggle(todo.id, !todo.is_completed);
    } catch (error) {
      setToggleError(
        error instanceof Error ? error.message : "Could not update this task.",
      );
    } finally {
      setTogglePending(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteError(null);
    try {
      await deleteTodo.mutateAsync(todo.id);
      setShowDeleteDialog(false);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete this task.",
      );
    }
  };

  return (
    <>
      <article
        className={`relative rounded-xl border bg-[color-mix(in_oklab,var(--app-card)_90%,var(--app-highlight))] shadow-[0_3px_0_color-mix(in_oklab,var(--app-line)_8%,transparent)] transition-colors hover:border-[color-mix(in_oklab,var(--app-primary)_30%,transparent)] ${
          collectionMenuOpen
            ? "z-40 border-[color-mix(in_oklab,var(--app-primary)_30%,transparent)]"
            : "z-0 border-[color-mix(in_oklab,var(--app-line)_14%,transparent)]"
        }`}
      >
        <div className="flex min-w-0 items-start gap-2 p-2.5 sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={togglePending}
            className={`flex size-11 flex-none items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)]/35 disabled:opacity-50 ${
              todo.is_completed
                ? "bg-[color-mix(in_oklab,var(--app-primary)_14%,var(--app-highlight))] text-[var(--app-primary)]"
                : "text-[var(--app-muted)] hover:bg-[color-mix(in_oklab,var(--app-primary)_9%,var(--app-highlight))] hover:text-[var(--app-primary)]"
            }`}
            aria-label={
              todo.is_completed
                ? `Mark ${todo.title} as open`
                : `Mark ${todo.title} complete`
            }
          >
            {todo.is_completed ? (
              <span className="flex size-6 items-center justify-center rounded-full bg-[var(--app-primary)] text-[var(--app-on-primary)]">
                <Check size={15} strokeWidth={3} aria-hidden="true" />
              </span>
            ) : (
              <Circle size={23} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onEdit(todo)}
            className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)]/30"
          >
            <span
              className={`block truncate text-sm font-semibold text-[var(--app-ink)] sm:text-base ${
                todo.is_completed ? "line-through opacity-55" : ""
              }`}
            >
              {todo.title}
            </span>
            {preview ? (
              <span
                className={`mt-0.5 block truncate text-xs text-[var(--app-muted)] sm:text-sm ${
                  todo.is_completed ? "opacity-50" : ""
                }`}
              >
                {preview}
              </span>
            ) : null}
          </button>

          <div className="flex flex-none flex-wrap items-center justify-end gap-1 sm:gap-2">
            {due && !todo.is_completed ? (
              <span
                className={`hidden items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold sm:inline-flex ${
                  due.tone === "overdue"
                    ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
                    : due.tone === "today"
                      ? "border-amber-500/30 bg-amber-400/12 text-amber-700 dark:text-amber-300"
                      : "border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-highlight)]/72 text-[var(--app-muted)]"
                }`}
              >
                <CalendarDays size={13} aria-hidden="true" />
                {due.label}
              </span>
            ) : null}

            <div className="hidden min-w-0 max-w-40 xl:block">
              <CollectionBadgeMenu
                title={todo.title}
                folder={todo.folder}
                onMove={(folderId) =>
                  updateFolder.mutateAsync({
                    entryId: todo.id,
                    kind: "todo",
                    folderId,
                  })
                }
                movePending={updateFolder.isPending}
                onOpenChange={setCollectionMenuOpen}
              />
            </div>

            <Button
              type="button"
              plain
              onClick={() => onEdit(todo)}
              className="size-10! cursor-pointer justify-center rounded-full! p-0! text-[var(--app-muted)]! hover:text-[var(--app-primary)]!"
              aria-label={`Edit ${todo.title}`}
            >
              <Pencil size={16} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              plain
              onClick={() => setShowDeleteDialog(true)}
              className="size-10! cursor-pointer justify-center rounded-full! p-0! text-[var(--app-muted)]! hover:text-red-500!"
              aria-label={isLocalAccount ? `Delete ${todo.title} permanently` : `Move ${todo.title} to Trash`}
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>

        {(due || todo.tags?.length || todo.folder || toggleError) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[color-mix(in_oklab,var(--app-line)_9%,transparent)] px-3 py-2 sm:hidden">
            {due && !todo.is_completed ? (
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  due.tone === "overdue"
                    ? "text-red-700 dark:text-red-300"
                    : due.tone === "today"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-[var(--app-muted)]"
                }`}
              >
                <CalendarDays size={13} aria-hidden="true" />
                {due.label}
              </span>
            ) : null}
            {todo.tags?.map((tag) => (
              <Badge
                key={tag.id}
                color="violet"
                className="max-w-full bg-violet-500/8! px-1.5! py-0! text-[11px]/4! text-violet-600! dark:text-violet-300!"
              >
                <span className="truncate" title={`#${tag.name}`}>
                  #{tag.name}
                </span>
              </Badge>
            ))}
            {todo.folder ? (
              <span className="truncate text-xs text-[var(--app-muted)]">
                {todo.folder.name}
              </span>
            ) : null}
            {toggleError ? (
              <p className="w-full text-xs text-red-600 dark:text-red-300" role="alert">
                {toggleError}
              </p>
            ) : null}
          </div>
        )}
        {toggleError ? (
          <p
            className="hidden border-t border-red-500/15 px-4 py-2 text-xs text-red-600 dark:text-red-300 sm:block"
            role="alert"
          >
            {toggleError}
          </p>
        ) : null}
      </article>

      <Dialog
        open={showDeleteDialog}
        onClose={
          deleteTodo.isPending ? () => {} : () => setShowDeleteDialog(false)
        }
        size="sm"
      >
        <DialogTitle>{isLocalAccount ? "Delete task permanently?" : "Move task to Trash?"}</DialogTitle>
        <DialogDescription>
          {isLocalAccount
            ? `“${todo.title}” will be deleted immediately. A free cloud account includes 7 days of Trash retention.`
            : `“${todo.title}” can be restored from Trash before its recovery period expires.`}
        </DialogDescription>
        {deleteError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">
            {deleteError}
          </p>
        ) : null}
        <DialogActions>
          <Button
            type="button"
            plain
            onClick={() => setShowDeleteDialog(false)}
            disabled={deleteTodo.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            color="red"
            onClick={() => void confirmDelete()}
            disabled={deleteTodo.isPending}
          >
            {deleteTodo.isPending ? "Deleting..." : isLocalAccount ? "Delete permanently" : "Move to Trash"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
