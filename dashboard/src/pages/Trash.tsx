import { useState } from "react";
import {
  BookOpen,
  Bookmark,
  ListTodo,
  Menu,
  RotateCcw,
  StickyNote,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import { Button } from "../components/ui/button";
import {
  useEmptyTrash,
  usePermanentlyDeleteTrashItem,
  useRestoreTrashItem,
  useTrash,
  type DecryptedTrashItem,
} from "../hooks/useTrashQuery";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import type { TrashResourceType } from "../lib/trashRepository";
import type { DashboardLayoutContext } from "./DashboardLayout";

const resourcePresentation: Record<
  TrashResourceType,
  { label: string; icon: LucideIcon; colorClass: string }
> = {
  bookmark: {
    label: "Bookmark",
    icon: Bookmark,
    colorClass: "bg-sky-500/10 text-sky-700",
  },
  note: {
    label: "Document",
    icon: StickyNote,
    colorClass: "bg-amber-500/12 text-amber-700",
  },
  todo: {
    label: "Task",
    icon: ListTodo,
    colorClass: "bg-emerald-500/10 text-emerald-700",
  },
  read: {
    label: "Readspace",
    icon: BookOpen,
    colorClass: "bg-violet-500/10 text-violet-700",
  },
};

const deletedDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function itemLabel(item: DecryptedTrashItem) {
  return item.title.trim() || `Untitled ${resourcePresentation[item.resourceType].label.toLowerCase()}`;
}

export default function Trash() {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const trashQuery = useTrash();
  const { data: accountPlan } = useAccountPlan();
  const restoreItem = useRestoreTrashItem();
  const permanentlyDelete = usePermanentlyDeleteTrashItem();
  const emptyTrash = useEmptyTrash();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DecryptedTrashItem | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [emptyDialogOpen, setEmptyDialogOpen] = useState(false);
  const [emptyError, setEmptyError] = useState<string | null>(null);
  const items = trashQuery.data ?? [];

  const restore = async (item: DecryptedTrashItem) => {
    setRestoreError(null);
    setRestoringId(item.id);
    try {
      await restoreItem.mutateAsync(item.id);
    } catch (error) {
      setRestoreError(
        error instanceof Error ? error.message : "Could not restore this item.",
      );
    } finally {
      setRestoringId(null);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await permanentlyDelete.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Could not permanently delete this item.",
      );
    }
  };

  const confirmEmptyTrash = async () => {
    setEmptyError(null);
    try {
      await emptyTrash.mutateAsync();
      setEmptyDialogOpen(false);
    } catch (error) {
      setEmptyError(
        error instanceof Error ? error.message : "Could not empty Trash.",
      );
    }
  };

  return (
    <div className="w-full min-w-0 flex-1 space-y-4 lg:space-y-5">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="w-full py-1 sm:py-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu size={20} aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">
                  Trash
                </h1>
                <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
                  {accountPlan
                    ? `${accountPlan.name} includes ${accountPlan.trashRecoveryDays}-day recovery`
                    : "Recovery time depends on the plan active when an item is deleted"}
                </p>
              </div>
            </div>
            {items.length > 0 ? (
              <Button
                type="button"
                outline
                className="whitespace-nowrap"
                onClick={() => {
                  setEmptyError(null);
                  setEmptyDialogOpen(true);
                }}
              >
                Empty Trash
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="px-3 pb-8 lg:px-0">
        {restoreError ? (
          <div
            className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {restoreError}
          </div>
        ) : null}

        {trashQuery.isLoading ? (
          <div className="space-y-3" aria-label="Loading Trash">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 rounded-xl liquid-skeleton"
              />
            ))}
          </div>
        ) : trashQuery.isError ? (
          <div
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-6 text-sm text-red-700"
            role="alert"
          >
            <p>Could not load Trash.</p>
            <Button
              type="button"
              outline
              className="mt-3"
              onClick={() => void trashQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--app-line)_22%,transparent)] bg-white/55 px-5 py-14 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--app-line)_9%,transparent)] text-[var(--app-muted)]">
              <Trash2 size={22} aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-semibold text-[var(--app-ink)]">
              Trash is empty
            </h3>
            <p className="mt-1 text-sm text-[var(--app-muted)]">
              {accountPlan
                ? `Deleted items on ${accountPlan.name} remain recoverable for ${accountPlan.trashRecoveryDays} days.`
                : "Deleted items remain recoverable for the period included with your plan."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="px-1 text-sm text-[var(--app-muted)]">
              {items.length} {items.length === 1 ? "item" : "items"}
            </p>
            <ul className="space-y-2">
              {items.map((item) => {
                const presentation = resourcePresentation[item.resourceType];
                const Icon = presentation.icon;
                const title = itemLabel(item);
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-white/78 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`flex size-9 flex-none items-center justify-center rounded-lg ${presentation.colorClass}`}
                        >
                          <Icon size={17} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="max-w-full truncate font-semibold text-[var(--app-ink)]">
                              {title}
                            </h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${presentation.colorClass}`}
                            >
                              {presentation.label}
                            </span>
                          </div>
                          {item.url ? (
                            <p className="mt-1 truncate text-sm text-[var(--app-muted)]">
                              {item.url}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-[var(--app-muted)]">
                            Deleted {deletedDateFormatter.format(new Date(item.deletedAt))}
                            {" · "}Expires {deletedDateFormatter.format(new Date(item.expiresAt))}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-none items-center gap-2 sm:justify-end">
                        <Button
                          type="button"
                          outline
                          className="gap-2"
                          disabled={restoringId === item.id}
                          onClick={() => void restore(item)}
                        >
                          <RotateCcw data-slot="icon" aria-hidden="true" />
                          {restoringId === item.id ? "Restoring..." : "Restore"}
                        </Button>
                        <Button
                          type="button"
                          plain
                          className="text-red-600! hover:bg-red-50!"
                          aria-label={`Permanently delete ${title}`}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(item);
                          }}
                        >
                          <Trash2 data-slot="icon" aria-hidden="true" />
                          <span className="hidden sm:inline">Delete forever</span>
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete forever?"
        description={`“${deleteTarget ? itemLabel(deleteTarget) : "This item"}” will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete forever"
        busyLabel="Deleting..."
        busy={permanentlyDelete.isPending}
        error={deleteError}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmPermanentDelete()}
      />

      <ConfirmDialog
        open={emptyDialogOpen}
        title="Empty Trash?"
        description={`All ${items.length} ${items.length === 1 ? "item" : "items"} will be permanently deleted. This cannot be undone.`}
        confirmLabel="Empty Trash"
        busyLabel="Emptying..."
        busy={emptyTrash.isPending}
        error={emptyError}
        onClose={() => setEmptyDialogOpen(false)}
        onConfirm={() => void confirmEmptyTrash()}
      />
    </div>
  );
}
