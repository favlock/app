import { LibrarySelectionContext } from "../context/LibrarySelectionContext";
import { useContext, useId, useState } from "react";
import {
  CalendarDays,
  Check,
  Circle,
  MoreHorizontal,
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
  const selection = useContext(LibrarySelectionContext);
  const { isLocalAccount } = useAuth();
  const deleteTodo = useDeleteTodo();
  const updateFolder = useUpdateEntryFolder();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsId = useId();
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

  if (selection) return <label className={`flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border border-[var(--app-mint-border)] bg-[var(--app-card)] p-4 ${selection.checked ? "ring-2 ring-[var(--app-primary)]" : ""}`}>
    <input type="checkbox" aria-label={`Select item: ${todo.title}`} checked={selection.checked} disabled={selection.disabled}
      className="size-4 accent-[var(--app-primary)]" onChange={() => {}} onClick={(event) => selection.toggle(event.shiftKey)} />
    <span className="min-w-0"><span className="block truncate font-semibold">{todo.title}</span>
      <span className="text-xs text-[var(--app-muted)]">{todo.is_completed ? "Completed" : "Open"}{todo.due_date ? ` · ${todo.due_date}` : ""}</span>
    </span>
  </label>;

  return (
    <>
      <article
        className={`library-card relative min-w-0 w-full px-3 py-2 ${collectionMenuOpen || actionsOpen ? "z-40" : "z-0"}`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && actionsOpen) {
            event.stopPropagation();
            setActionsOpen(false);
          }
        }}
      >
        <div className="flex min-h-14 min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={togglePending}
            className={`library-card-badge flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] disabled:opacity-50 ${
              todo.is_completed
                ? "text-[var(--app-primary)]"
                : "hover:text-[var(--app-primary)]"
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

          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => onEdit(todo)} title={todo.title}
              className={`block w-full truncate rounded-sm text-left text-sm font-semibold leading-5 text-[var(--app-ink)] hover:text-[var(--app-primary)] focus-visible:outline-2 focus-visible:outline-[var(--app-primary)] ${todo.is_completed ? "line-through opacity-55" : ""}`}>
              {todo.title}
            </button>
            <p className="min-w-0 truncate text-xs leading-5 text-[var(--app-muted)]">
              Task · <span className={due && !todo.is_completed
                ? due.tone === "overdue" ? "font-semibold text-red-700 dark:text-red-300"
                  : due.tone === "today" ? "font-semibold text-amber-700 dark:text-amber-300"
                    : ""
                : ""}>{todo.is_completed ? "Completed" : due ? due.label : "Open"}</span>
              {todo.folder ? ` · ${todo.folder.name}` : ""}
            </p>
          </div>
          <button type="button" aria-label={`Actions for ${todo.title}`} aria-expanded={actionsOpen} aria-controls={actionsId}
            onClick={() => setActionsOpen((open) => !open)}
            className="theme-button-icon flex size-11 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2">
            <MoreHorizontal size={19} aria-hidden="true" />
          </button>
        </div>

        {actionsOpen ? (
          <div id={actionsId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--card-border)] pt-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <CollectionBadgeMenu title={todo.title} folder={todo.folder}
                onMove={(folderId) => updateFolder.mutateAsync({ entryId: todo.id, kind: "todo", folderId })}
                movePending={updateFolder.isPending} onOpenChange={setCollectionMenuOpen} />
              {due && !todo.is_completed ? <span className={`inline-flex items-center gap-1 text-xs ${due.tone === "overdue" ? "text-red-700 dark:text-red-300" : due.tone === "today" ? "text-amber-700 dark:text-amber-300" : "text-[var(--app-muted)]"}`}>
                <CalendarDays size={13} aria-hidden="true" />{due.label}
              </span> : null}
              {todo.tags?.map((tag) => <Badge key={tag.id} color="violet"
                className="max-w-full bg-violet-500/8! px-1.5! py-0! text-[11px]/4! text-violet-600! dark:text-violet-300!">
                <span className="truncate" title={`#${tag.name}`}>#{tag.name}</span>
              </Badge>)}
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" plain onClick={() => onEdit(todo)} aria-label={`Edit ${todo.title}`}
                className="size-10! cursor-pointer justify-center rounded-full! p-0! text-[var(--app-muted)]! hover:text-[var(--app-primary)]!">
                <Pencil size={16} aria-hidden="true" />
              </Button>
              <Button type="button" plain onClick={() => setShowDeleteDialog(true)}
                aria-label={isLocalAccount ? `Delete ${todo.title} permanently` : `Move ${todo.title} to Trash`}
                className="size-10! cursor-pointer justify-center rounded-full! p-0! text-[var(--app-muted)]! hover:text-red-500!">
                <Trash2 size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
        {actionsOpen && preview ? <p className="truncate border-t border-[var(--card-border)] py-2 text-xs text-[var(--app-muted)]">{preview}</p> : null}
        {toggleError ? <p className="border-t border-red-500/15 py-2 text-xs text-red-600 dark:text-red-300" role="alert">{toggleError}</p> : null}
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
