import { AlertTriangle, Download, Trash2 } from "lucide-react";
import type { BookmarkAccess } from "@favlock/shared";
import { useMemo, useState } from "react";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useBookmarks, useDeleteBookmark } from "../hooks/useBookmarksQuery";
import BillingSection from "./BillingSection";
import DataExportSection from "./DataExportSection";
import { Button } from "./ui/button";

function formatDate(value: string | null): string {
  if (!value) return "the scheduled cleanup date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
    new Date(value),
  );
}

export function BookmarkLimitGraceNotice({ access }: { access: BookmarkAccess }) {
  return (
    <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-900 dark:text-amber-200" role="status">
      <p className="font-semibold">Your library is above the Free bookmark allowance.</p>
      <p className="mt-1">
        You can keep using and editing FavLock until {formatDate(access.graceEndsAt)},
        but creating, importing, or restoring bookmarks is paused. Delete {Math.max(0, access.count - access.limit).toLocaleString()} bookmarks or upgrade to Pro to avoid recovery mode.
      </p>
    </div>
  );
}

export default function BookmarkLimitRecovery({ access }: { access: BookmarkAccess }) {
  const { data: bookmarks = [] } = useBookmarks();
  const deleteBookmark = useDeleteBookmark();
  const { refetch } = useAccountPlan();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const newestBookmarks = useMemo(
    () => [...bookmarks].sort((left, right) =>
      right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
    ).slice(0, 100),
    [bookmarks],
  );
  const excess = Math.max(0, access.count - access.limit);

  const removeBookmark = async (bookmarkId: string) => {
    setDeleteError(null);
    try {
      await deleteBookmark.mutateAsync(bookmarkId);
      await refetch();
    } catch {
      setDeleteError("FavLock could not delete that bookmark. Please try again.");
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <section className="rounded-[2rem] border border-amber-500/30 bg-[var(--app-card)] p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold liquid-ink">Bookmark recovery mode</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 liquid-muted">
              This Free account has {access.count.toLocaleString()} bookmarks; the allowance is {access.limit.toLocaleString()}.
              Normal library use is paused. Export your data, delete {excess.toLocaleString()} bookmarks, or upgrade to Pro to restore access immediately.
            </p>
            <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              On {formatDate(access.cleanupAt)}, FavLock will permanently remove the newest excess bookmarks and preserve the oldest {access.limit.toLocaleString()}.
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6">
        <section className="rounded-[2rem] border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[var(--app-card)] p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <Download className="size-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            <h2 className="text-lg font-semibold liquid-ink">Export your library</h2>
          </div>
          <DataExportSection />
        </section>

        <section className="rounded-[2rem] border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[var(--app-card)] p-6 sm:p-8">
          <BillingSection />
        </section>

        <section className="rounded-[2rem] border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-[var(--app-card)] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Trash2 className="size-5 text-red-600 dark:text-red-300" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold liquid-ink">Delete bookmarks</h2>
              <p className="mt-1 text-sm liquid-muted">The newest 100 bookmarks are shown first. Deleted bookmarks move to Trash under the normal recovery rules.</p>
            </div>
          </div>
          {deleteError ? <p className="mt-4 text-sm text-red-700 dark:text-red-300" role="alert">{deleteError}</p> : null}
          <ul className="mt-5 divide-y divide-[color-mix(in_oklab,var(--app-line)_14%,transparent)]">
            {newestBookmarks.map((bookmark) => (
              <li key={bookmark.id} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium liquid-ink">{bookmark.title || bookmark.url}</p>
                  <p className="truncate text-xs liquid-muted">{bookmark.url}</p>
                </div>
                <Button
                  type="button"
                  plain
                  disabled={deleteBookmark.isPending}
                  onClick={() => void removeBookmark(bookmark.id)}
                  aria-label={`Delete ${bookmark.title || bookmark.url}`}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
          {newestBookmarks.length === 0 ? <p className="mt-5 text-sm liquid-muted">Sync this device to load bookmarks available for deletion.</p> : null}
        </section>

        <p className="text-center text-sm liquid-muted">
          Need help? <a className="font-medium text-emerald-700 dark:text-emerald-300 underline" href="mailto:support@favlock.app">support@favlock.app</a>
        </p>
      </div>
    </main>
  );
}
