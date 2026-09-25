import {
  CalendarClock,
  ExternalLink,
  Link2Off,
  Menu,
  Pause,
  Play,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "../components/ui/button";
import LibraryHealthTabs from "../components/LibraryHealthTabs";
import { useAuth } from "../context/useAuth";
import { useLinkHealth } from "../context/useLinkHealth";
import { useDeleteBookmark } from "../hooks/useBookmarksQuery";
import { useRecordBookmarkOpen } from "../hooks/useBookmarkUsage";
import type { LinkHealthStatus } from "../lib/linkHealthApi";
import { normalizeImportedBookmarkUrl } from "../lib/bookmarkUrl";
import { Checkbox } from "../components/ui/checkbox";
import type { DashboardLayoutContext } from "./DashboardLayout";

const RESULT_PAGE_SIZE = 120;

const STATUS_LABELS: Record<LinkHealthStatus, string> = {
  broken: "Broken",
  redirected: "Redirected",
  restricted: "Restricted",
  unverified: "Couldn’t verify",
  working: "Working",
};

const STATUS_STYLES: Record<LinkHealthStatus, string> = {
  broken: "bg-[var(--app-rose)] text-red-700 dark:text-red-200",
  redirected: "bg-[var(--app-lavender)] text-[var(--app-primary)]",
  restricted: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-200",
  unverified: "bg-orange-500/15 text-orange-800 dark:text-orange-200",
  working: "bg-[var(--app-mint)] text-emerald-700 dark:text-emerald-200",
};

const STATUS_CARD_STYLES: Record<LinkHealthStatus, string> = {
  broken: "border-red-500/25 bg-red-500/8",
  redirected: "border-violet-500/20 bg-violet-500/8",
  restricted: "border-yellow-500/30 bg-yellow-500/10",
  unverified: "border-orange-500/25 bg-orange-500/8",
  working: "border-emerald-500/20 bg-emerald-500/8",
};

function formatScanTime(value: string | null): string {
  if (!value) return "Not checked yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function BrokenLinks() {
  const recordBookmarkOpen = useRecordBookmarkOpen();
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const { isLocalAccount } = useAuth();
  const {
    applyRemoval,
    canScan,
    deviceState,
    error,
    loadStoredResults,
    pauseScan,
    phase,
    results,
    scanNow,
    setAutomaticScanEnabled,
  } = useLinkHealth();
  const deleteBookmark = useDeleteBookmark();
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(
    new Set(),
  );
  const [visibleResultCount, setVisibleResultCount] = useState(RESULT_PAGE_SIZE);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => void loadStoredResults(), [loadStoredResults]);
  useEffect(() => {
    if (!isOptionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !optionsRef.current?.contains(event.target)) {
        setIsOptionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOptionsOpen(false);
      optionsButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOptionsOpen]);

  const brokenResults = useMemo(() => {
    return [...(results ?? [])]
      .filter((result) => result.status === "broken")
      .sort((left, right) => left.bookmark.title.localeCompare(right.bookmark.title));
  }, [results]);
  const visibleResults = brokenResults.slice(0, visibleResultCount);

  useEffect(() => {
    setVisibleResultCount(RESULT_PAGE_SIZE);
    setSelectedBookmarkIds(
      new Set(brokenResults.map((result) => result.bookmark.id)),
    );
  }, [brokenResults]);

  const toggleBookmark = (bookmarkId: string, selected: boolean) => {
    setSelectedBookmarkIds((current) => {
      const next = new Set(current);
      if (selected) next.add(bookmarkId);
      else next.delete(bookmarkId);
      return next;
    });
  };

  const moveSelectedToTrash = async () => {
    const selectedResults = brokenResults.filter((result) =>
      selectedBookmarkIds.has(result.bookmark.id),
    );
    if (selectedResults.length === 0) return;

    setIsDeleting(true);
    setCleanupStatus(null);
    const removedIds: string[] = [];
    const failedIds: string[] = [];

    for (const result of selectedResults) {
      try {
        await deleteBookmark.mutateAsync(result.bookmark.id);
        removedIds.push(result.bookmark.id);
      } catch {
        failedIds.push(result.bookmark.id);
      }
    }

    let savedStatusUpdated = true;
    if (removedIds.length > 0) {
      try {
        await applyRemoval(removedIds);
      } catch {
        savedStatusUpdated = false;
      }
    }
    setSelectedBookmarkIds(new Set(failedIds));

    if (failedIds.length > 0) {
      setCleanupStatus({
        type: "error",
        message: `${removedIds.length.toLocaleString()} moved to Trash. ${failedIds.length.toLocaleString()} couldn’t be moved. Try again.`,
      });
    } else {
      setCleanupStatus({
        type: "success",
        message: savedStatusUpdated
          ? `${removedIds.length.toLocaleString()} ${removedIds.length === 1 ? "bookmark" : "bookmarks"} moved to Trash.`
          : `${removedIds.length.toLocaleString()} ${removedIds.length === 1 ? "bookmark was" : "bookmarks were"} moved to Trash. Saved scan status will refresh next time.`,
      });
    }
    setIsDeleting(false);
  };

  return (
    <div className="w-full min-w-0 flex-1 space-y-5 lg:space-y-6">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="flex w-full flex-col gap-4 py-1 sm:py-2 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={() => setIsMobileSidebarOpen(true)} className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden" aria-label="Open navigation">
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">Library health</h1>
              <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">Review links that may no longer be available</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-11 lg:pl-0">
            <div className="relative" ref={optionsRef}>
              <button ref={optionsButtonRef} type="button" className="theme-button-icon flex size-10 items-center justify-center" aria-label="Broken link scan options" aria-haspopup="dialog" aria-expanded={isOptionsOpen} onClick={() => setIsOptionsOpen((open) => !open)}>
                <SlidersHorizontal size={17} aria-hidden="true" />
              </button>
              {isOptionsOpen ? (
                <div role="dialog" aria-label="Broken link scan options" className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-card)] p-4 shadow-xl">
                  <h2 className="text-sm font-semibold text-[var(--app-ink)]">Scan options</h2>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-[var(--app-highlight)]">
                    <input type="checkbox" checked={deviceState.automaticScanEnabled} disabled={isLocalAccount} onChange={(event) => setAutomaticScanEnabled(event.target.checked)} className="mt-1 accent-[var(--app-primary)]" />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--app-ink)]"><CalendarClock size={14} aria-hidden="true" /> Automatic check</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--app-muted)]">Check after login when seven days have passed. Changing this setting does not start a check.</span>
                    </span>
                  </label>
                  <p className="mt-3 border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] pt-3 text-xs leading-5 text-[var(--app-muted)]">URLs are decrypted on this device and sent temporarily to FavLock’s API for checking. They are not saved by the service.</p>
                </div>
              ) : null}
            </div>
            <Button type="button" outline className="gap-2" disabled={!canScan && phase !== "scanning"} onClick={() => phase === "scanning" ? pauseScan() : void scanNow()}>
              {phase === "scanning" ? <Pause className="size-4" aria-hidden="true" /> : deviceState.scanPaused ? <Play className="size-4" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              {phase === "scanning" ? "Pause" : deviceState.scanPaused ? "Resume" : "Check now"}
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11 text-xs text-[var(--app-muted)] lg:pl-0">
          <span className="inline-flex items-center gap-1.5"><Link2Off size={13} aria-hidden="true" />{deviceState.brokenCount.toLocaleString()} broken links</span>
          <span>Last check: {formatScanTime(deviceState.lastScanAt)}</span>
          {deviceState.scanPaused ? <span>Paused: {deviceState.scannedCount.toLocaleString()} of {deviceState.totalCount.toLocaleString()}</span> : null}
          {deviceState.automaticScanEnabled && deviceState.nextScanAt ? <span>Next check: {formatScanTime(deviceState.nextScanAt)}</span> : null}
        </div>
      </header>

      <LibraryHealthTabs activeTab="broken-links" />

      <section className="px-4 pb-8 sm:px-5 lg:px-0">
        <div className="max-w-5xl space-y-4">
          {cleanupStatus ? (
            <div
              role={cleanupStatus.type === "error" ? "alert" : "status"}
              aria-live="polite"
              className={`rounded-xl border px-4 py-3 text-sm ${
                cleanupStatus.type === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {cleanupStatus.message}
            </div>
          ) : null}
          {isLocalAccount ? (
            <div className="rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-card)] p-5 text-sm text-[var(--app-muted)]">Broken-link checks require a cloud account because browsers cannot reliably check arbitrary websites.</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-[var(--app-rose)] p-5 text-sm text-red-700 dark:text-red-200">{error}</div>
          ) : results === null ? (
            <div className="rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-card)] p-5 text-sm text-[var(--app-muted)]">Loading saved link results…</div>
          ) : brokenResults.length === 0 ? (
            <div className="rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-card)] p-8 text-center">
              <Link2Off className="mx-auto size-6 text-[var(--app-muted)]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[var(--app-ink)]">{deviceState.lastScanAt ? "No saved link issues" : "Check your library links"}</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">{deviceState.lastScanAt ? "No confirmed broken links were found." : "Run the first check when you’re ready."}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleResults.map((result) => (
                <article
                  key={result.bookmark.id}
                  data-status={result.status}
                  className={`min-w-0 rounded-2xl border p-4 transition-[border-color,background-color] ${
                    selectedBookmarkIds.has(result.bookmark.id)
                      ? "ring-1 ring-[color-mix(in_oklab,var(--app-primary)_20%,transparent)]"
                      : "opacity-75"
                  } ${STATUS_CARD_STYLES[result.status]}`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      color="emerald"
                      checked={selectedBookmarkIds.has(result.bookmark.id)}
                      disabled={isDeleting}
                      onChange={(selected) =>
                        toggleBookmark(result.bookmark.id, selected)
                      }
                      aria-label={`Select ${result.bookmark.title || result.bookmark.url}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${STATUS_STYLES[result.status]}`}>{STATUS_LABELS[result.status]}</span>
                          {result.statusCode ? (
                            <span className="rounded-lg border border-black/10 bg-white/45 px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-[var(--app-ink)] dark:border-white/10 dark:bg-black/10">
                              HTTP {result.statusCode}
                            </span>
                          ) : null}
                        </div>
                        <a href={normalizeImportedBookmarkUrl(result.bookmark.url) ?? undefined} target="_blank" rel="noopener noreferrer" onClick={() => { if (normalizeImportedBookmarkUrl(result.bookmark.url)) recordBookmarkOpen(result.bookmark.id); }} onAuxClick={(event) => { if (event.button === 1 && normalizeImportedBookmarkUrl(result.bookmark.url)) recordBookmarkOpen(result.bookmark.id); }} className="theme-button-icon flex size-8 flex-none items-center justify-center" aria-label={`Open ${result.bookmark.title}`}><ExternalLink size={14} aria-hidden="true" /></a>
                      </div>
                      <h2 className="mt-3 truncate text-sm font-semibold text-[var(--app-ink)]" title={result.bookmark.title}>{result.bookmark.title}</h2>
                      <p className="mt-1 truncate text-xs text-[var(--app-muted)]" title={result.bookmark.url}>{result.bookmark.url}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {visibleResultCount < brokenResults.length ? (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                outline
                onClick={() => setVisibleResultCount((current) => current + RESULT_PAGE_SIZE)}
              >
                Show more ({(brokenResults.length - visibleResultCount).toLocaleString()} remaining)
              </Button>
            </div>
          ) : null}
          {brokenResults.length > 0 ? (
            <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_92%,transparent)] p-2.5 shadow-lg backdrop-blur-xl">
              <p className="px-1 text-xs tabular-nums text-[var(--app-muted)]">
                {selectedBookmarkIds.size.toLocaleString()} selected
              </p>
              <Button
                type="button"
                color="red"
                disabled={isDeleting || selectedBookmarkIds.size === 0}
                onClick={() => void moveSelectedToTrash()}
              >
                {isDeleting
                  ? "Moving…"
                  : `Move ${selectedBookmarkIds.size.toLocaleString()} to Trash`}
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
