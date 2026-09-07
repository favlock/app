import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Copy,
  LoaderCircle,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useDuplicateScan } from "../context/useDuplicateScan";
import { RESOURCE_USAGE_QUERY_KEY } from "../hooks/useResourceUsageQuery";
import { countDuplicateBookmarks } from "../lib/bookmarkDuplicates";
import { cleanupDuplicateBookmarks } from "../lib/bookmarkRepository";
import { Button } from "./ui/button";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import { Label } from "./ui/fieldset";

type CleanupStatus =
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function BookmarkDuplicateCleanupSection() {
  const { session, retryBookmarkCacheSync } = useAuth();
  const {
    applyCleanup,
    deviceState,
    error: scanError,
    groups,
    loadStoredGroups,
    phase,
  } = useDuplicateScan();
  const queryClient = useQueryClient();
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isCleaning, setIsCleaning] = useState(false);
  const [status, setStatus] = useState<CleanupStatus | null>(null);

  useEffect(() => {
    if (phase === "scanning" || groups !== null) return;
    void loadStoredGroups().catch(() => {
      setStatus({
        type: "error",
        message: "Could not load the saved duplicate review.",
      });
    });
  }, [groups, loadStoredGroups, phase]);

  useEffect(() => {
    setSelectedUrls(
      new Set(groups?.map((group) => group.normalizedUrl) ?? []),
    );
  }, [groups]);

  const selectedGroups = useMemo(
    () => groups?.filter((group) => selectedUrls.has(group.normalizedUrl)) ?? [],
    [groups, selectedUrls],
  );
  const selectedDuplicateCount = countDuplicateBookmarks(selectedGroups);

  const toggleGroup = (normalizedUrl: string, selected: boolean) => {
    setSelectedUrls((current) => {
      const next = new Set(current);
      if (selected) next.add(normalizedUrl);
      else next.delete(normalizedUrl);
      return next;
    });
  };

  const cleanupSelectedDuplicates = async () => {
    if (selectedGroups.length === 0) return;

    setIsCleaning(true);
    setStatus(null);
    try {
      const removedCount = await cleanupDuplicateBookmarks(
        session?.access_token ?? "",
        selectedGroups.map((group) => ({
          survivorId: group.keeper.id,
          duplicateIds: group.duplicates.map((bookmark) => bookmark.id),
        })),
      );
      applyCleanup(
        selectedGroups.map((group) => group.keeper.id),
        removedCount,
      );
      setStatus({
        type: "success",
        message: `${removedCount} duplicate ${removedCount === 1 ? "bookmark" : "bookmarks"} removed.`,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["tag-bookmark-ids"] }),
        queryClient.invalidateQueries({ queryKey: ["folders"] }),
        queryClient.invalidateQueries({ queryKey: RESOURCE_USAGE_QUERY_KEY }),
      ]);
      retryBookmarkCacheSync();
    } catch (cleanupError) {
      setStatus({
        type: "error",
        message:
          cleanupError instanceof Error
            ? cleanupError.message
            : "Could not clean up duplicate bookmarks.",
      });
    } finally {
      setIsCleaning(false);
    }
  };

  if (phase === "scanning") {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-4 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--app-lavender)] text-[var(--app-primary)]">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-[var(--app-ink)]">
          Scanning your library
        </h2>
        <p className="mt-1 text-sm text-[var(--app-muted)]">
          {deviceState.scannedCount.toLocaleString()} of {deviceState.totalCount.toLocaleString()} bookmarks checked
        </p>
        <div className="mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--app-line)_12%,transparent)]">
          <div
            className="h-full rounded-full bg-[var(--app-primary)] transition-[width] duration-200"
            style={{
              width: `${deviceState.totalCount > 0 ? (deviceState.scannedCount / deviceState.totalCount) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    const hasCompletedScan = Boolean(deviceState.lastScanAt);
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--app-mint)] text-emerald-700 dark:text-emerald-300">
          {deviceState.duplicateCount > 0 ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-5" aria-hidden="true" />
          )}
        </span>
        <h2 className="mt-4 text-base font-semibold text-[var(--app-ink)]">
          {deviceState.duplicateCount > 0
            ? "Loading duplicate details"
            : hasCompletedScan
              ? "Your library is tidy"
              : "Your first scan will start automatically"}
        </h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-[var(--app-muted)]">
          {deviceState.duplicateCount > 0
            ? "FavLock is rebuilding the review from the saved device status."
            : hasCompletedScan
              ? "No duplicate bookmark URLs were found in the latest scan."
              : "FavLock scans after your encrypted library is unlocked and synchronized."}
        </p>
        {scanError || status?.type === "error" ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-300" role="alert">
            {scanError ?? status?.message}
          </p>
        ) : null}
        {status?.type === "success" ? (
          <p className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-300" role="status">
            {status.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--app-ink)]">
            Review duplicate bookmarks
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
            FavLock keeps the oldest copy and combines tags, favorite status,
            and a collection when the keeper does not already have one.
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-300">
          {selectedGroups.length} {selectedGroups.length === 1 ? "group" : "groups"} · {selectedDuplicateCount} selected
        </span>
      </div>

      {status ? (
        <div
          role={status.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            status.type === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {status.type === "success" ? (
            <Check className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          ) : null}
          <p>{status.message}</p>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <span className="text-xs tabular-nums text-[var(--app-muted)]" aria-live="polite">
          {groups.length} {groups.length === 1 ? "group" : "groups"}
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const hiddenDuplicates = group.duplicates.slice(2);
          const isSelected = selectedUrls.has(group.normalizedUrl);

          return (
              <li key={group.normalizedUrl} className="min-w-0 list-none">
                <CheckboxField
                  className={`h-full min-w-0 rounded-3xl border p-3.5 shadow-sm transition-[border-color,background-color] ${
                    isSelected
                      ? "border-[color-mix(in_oklab,var(--app-primary)_24%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_92%,var(--app-lavender))]"
                      : "border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-card)]"
                  }`}
                >
                  <Checkbox
                    color="emerald"
                    checked={isSelected}
                    disabled={isCleaning}
                    onChange={(selected) =>
                      toggleGroup(group.normalizedUrl, selected)
                    }
                  />
                  <Label className="min-w-0 cursor-pointer">
                    <span className="flex min-w-0 items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Copy className="size-4 flex-none text-[var(--app-primary)]" aria-hidden="true" />
                        <span className="truncate text-sm font-semibold text-[var(--app-ink)]">
                          {group.keeper.title || group.normalizedUrl}
                        </span>
                      </span>
                      <span className="flex-none rounded-full bg-amber-500/12 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-700 dark:text-amber-300">
                        +{group.duplicates.length}
                      </span>
                    </span>
                    <span
                      className="mt-1 block truncate text-xs font-normal text-[var(--app-muted)]"
                      title={group.normalizedUrl}
                    >
                      {group.normalizedUrl}
                    </span>
                    <span className="mt-1.5 line-clamp-2 block text-xs font-normal leading-5 text-[var(--app-muted)]">
                      {group.matchNote}
                    </span>

                    <span className="mt-3 block border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] pt-2.5">
                      <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Keep oldest
                      </span>
                      <span
                        className="mt-0.5 block truncate text-xs font-normal text-[var(--app-muted)]"
                        title={group.keeper.url}
                      >
                        {group.keeper.url}
                      </span>
                    </span>

                    <span className="mt-2.5 block text-[0.6875rem] font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
                      Remove
                    </span>
                    {group.duplicates.slice(0, 2).map((bookmark) => (
                      <span
                        key={bookmark.id}
                        className="mt-0.5 block truncate text-xs font-normal text-[var(--app-muted)]"
                        title={bookmark.url}
                      >
                        {bookmark.url}
                      </span>
                    ))}
                  </Label>
                  {hiddenDuplicates.length > 0 ? (
                    <details className="col-start-2 mt-1 min-w-0 text-xs text-[var(--app-muted)]">
                      <summary className="cursor-pointer font-semibold text-[var(--app-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)]">
                        Show {hiddenDuplicates.length} more
                      </summary>
                      <div className="mt-1.5 space-y-1">
                        {hiddenDuplicates.map((bookmark) => (
                          <p
                            key={bookmark.id}
                            className="truncate"
                            title={bookmark.url}
                          >
                            {bookmark.url}
                          </p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </CheckboxField>
              </li>
          );
        })}
      </ul>

      <div className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_92%,transparent)] p-2.5 shadow-lg backdrop-blur-xl">
        <p className="px-1 text-xs tabular-nums text-[var(--app-muted)]">
          {selectedGroups.length} selected {selectedGroups.length === 1 ? "group" : "groups"}
        </p>
        <Button
          type="button"
          color="red"
          disabled={isCleaning || selectedDuplicateCount === 0}
          onClick={() => void cleanupSelectedDuplicates()}
        >
          {isCleaning
            ? "Cleaning up..."
            : `Remove ${selectedDuplicateCount} ${selectedDuplicateCount === 1 ? "duplicate" : "duplicates"}`}
        </Button>
      </div>
    </section>
  );
}
