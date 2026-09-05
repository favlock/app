import { useState, type FormEvent } from "react";
import { CalendarDays, LoaderCircle, Plus, X } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useEntryCount } from "../hooks/useEntriesQuery";
import { useCreateTodo } from "../hooks/useTodosQuery";
import { ENTRY_TITLE_MAX_LENGTH } from "../lib/entryContent";
import { Button } from "./ui/button";

export default function TodoQuickAdd() {
  const { user } = useAuth();
  const { encryptField } = useEncryption();
  const { data: accountPlan } = useAccountPlan();
  const { data: entryCount = 0 } = useEntryCount();
  const createTodo = useCreateTodo();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showDueDate, setShowDueDate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || createTodo.isPending) return;
    setError(null);

    if (!user) {
      setError("Your session has expired. Sign in again to add a task.");
      return;
    }
    if (accountPlan && entryCount >= accountPlan.limits.entries) {
      setError(
        `Entry limit reached. You can have at most ${accountPlan.limits.entries} documents and tasks combined.`,
      );
      return;
    }

    try {
      await createTodo.mutateAsync({
        title: await encryptField(cleanTitle),
        content: await encryptField(""),
        folderId: null,
        existingTagIds: [],
        newEncryptedTagNames: [],
        dueDate: dueDate || null,
      });
      setTitle("");
      setDueDate("");
      setShowDueDate(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not create this task.",
      );
    }
  };

  return (
    <form onSubmit={submit} className="mt-4" aria-label="Quick add task">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--app-primary)]">
          Quick add
        </p>
        <p className="text-xs text-[var(--app-muted)]">
          Capture a task; add details later.
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-[color-mix(in_oklab,var(--app-primary)_20%,transparent)] bg-[var(--app-highlight)]/82 p-2 shadow-sm focus-within:border-[color-mix(in_oklab,var(--app-primary)_45%,transparent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_12%,transparent)] sm:flex-row sm:items-center">
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2">
          <Plus
            size={18}
            className="flex-none text-[var(--app-primary)]"
            aria-hidden="true"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={ENTRY_TITLE_MAX_LENGTH}
            placeholder="Add a task and press Enter..."
            aria-label="Task title"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[var(--app-ink)] outline-none placeholder:text-[var(--app-muted)] sm:text-base"
          />
        </div>

        {showDueDate ? (
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--app-line)_13%,transparent)] bg-[var(--app-highlight)]/70 px-3 text-xs font-medium text-[var(--app-muted)] sm:flex-none">
            <CalendarDays size={15} aria-hidden="true" />
            <span className="sr-only">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-label="Due date"
              autoFocus
              className="min-w-0 border-0 bg-transparent py-1 text-sm text-[var(--app-ink)] outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setDueDate("");
                setShowDueDate(false);
              }}
              className="flex size-7 items-center justify-center rounded-full hover:bg-[color-mix(in_oklab,var(--app-line)_8%,transparent)]"
              aria-label="Remove due date"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setShowDueDate(true)}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--app-line)_13%,transparent)] bg-[var(--app-highlight)]/70 px-3 text-sm font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-ink)] sm:flex-none"
          >
            <CalendarDays size={15} aria-hidden="true" />
            Add due date
          </button>
        )}

        <Button
          type="submit"
          color="emerald"
          disabled={!title.trim() || createTodo.isPending}
          className="min-h-10 justify-center gap-2 sm:flex-none"
        >
          {createTodo.isPending ? (
            <LoaderCircle data-slot="icon" className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus data-slot="icon" aria-hidden="true" />
          )}
          Add
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
