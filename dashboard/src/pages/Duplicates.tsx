import {
  CalendarClock,
  Copy,
  LoaderCircle,
  Menu,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import BookmarkDuplicateCleanupSection from "../components/BookmarkDuplicateCleanupSection";
import LibraryHealthTabs from "../components/LibraryHealthTabs";
import { Button } from "../components/ui/button";
import { useDuplicateScan } from "../context/useDuplicateScan";
import type { DuplicateMatchMode } from "../lib/bookmarkDuplicates";
import type { DashboardLayoutContext } from "./DashboardLayout";

const MATCH_MODES: {
  id: DuplicateMatchMode;
  label: string;
  description: string;
}[] = [
  {
    id: "tracking",
    label: "Ignore tracking",
    description: "Ignore page sections and known tracking parameters.",
  },
  {
    id: "exact",
    label: "Exact URL",
    description: "Require query parameters and page sections to match.",
  },
  {
    id: "query",
    label: "Ignore all parameters",
    description: "Treat every query variation of the same path as one page.",
  },
];

function formatScanTime(value: string | null): string {
  if (!value) return "Not scanned yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Duplicates() {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const {
    canScan,
    deviceState,
    phase,
    scanNow,
    setDailyScanEnabled,
    setMatchMode,
  } = useDuplicateScan();

  useEffect(() => {
    if (!isOptionsOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !optionsRef.current?.contains(event.target)
      ) {
        setIsOptionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
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

  return (
    <div className="w-full min-w-0 flex-1 space-y-5 lg:space-y-6">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="flex w-full flex-col gap-4 py-1 sm:py-2 md:flex-row md:items-start md:justify-between">
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
                Library health
              </h1>
              <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
                Review repeated bookmarks in your library
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-11 lg:pl-0">
            <div className="relative" ref={optionsRef}>
              <button
                ref={optionsButtonRef}
                type="button"
                className="theme-button-icon flex size-10 items-center justify-center"
                aria-label="Duplicate scan options"
                aria-haspopup="dialog"
                aria-expanded={isOptionsOpen}
                aria-controls="duplicate-scan-options"
                onClick={() => setIsOptionsOpen((open) => !open)}
              >
                <SlidersHorizontal size={17} aria-hidden="true" />
              </button>
              {isOptionsOpen ? (
                <div
                  id="duplicate-scan-options"
                  role="dialog"
                  aria-labelledby="duplicate-scan-options-title"
                  className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-card)] p-4 shadow-xl"
                >
                  <h2
                    id="duplicate-scan-options-title"
                    className="text-sm font-semibold text-[var(--app-ink)]"
                  >
                    Scan options
                  </h2>
                  <fieldset className="mt-3 space-y-2">
                    <legend className="sr-only">URL matching</legend>
                    {MATCH_MODES.map((mode) => (
                      <label
                        key={mode.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-[var(--app-highlight)]"
                      >
                        <input
                          type="radio"
                          name="duplicate-match-mode"
                          checked={deviceState.matchMode === mode.id}
                          disabled={phase === "scanning"}
                          onChange={() => setMatchMode(mode.id)}
                          className="mt-1 accent-[var(--app-primary)]"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-[var(--app-ink)]">
                            {mode.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-[var(--app-muted)]">
                            {mode.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] px-2 pt-4">
                    <input
                      type="checkbox"
                      checked={deviceState.dailyScanEnabled}
                      onChange={(event) =>
                        setDailyScanEnabled(event.target.checked)
                      }
                      className="mt-1 accent-[var(--app-primary)]"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--app-ink)]">
                        <CalendarClock size={14} aria-hidden="true" />
                        Automatic scan
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--app-muted)]">
                        Scan after login when 24 hours have passed.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              outline
              className="gap-2"
              disabled={!canScan || phase === "scanning"}
              onClick={() => void scanNow()}
            >
              {phase === "scanning" ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              {phase === "scanning" ? "Scanning" : "Scan now"}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-11 text-xs text-[var(--app-muted)] lg:pl-0">
          <span className="inline-flex items-center gap-1.5">
            <Copy size={13} aria-hidden="true" />
            {deviceState.duplicateCount.toLocaleString()} duplicates
          </span>
          <span>Last scan: {formatScanTime(deviceState.lastScanAt)}</span>
          {deviceState.dailyScanEnabled && deviceState.nextScanAt ? (
            <span>Next scan: {formatScanTime(deviceState.nextScanAt)}</span>
          ) : null}
        </div>
      </header>

      <LibraryHealthTabs activeTab="duplicates" />

      <section className="px-4 pb-8 sm:px-5 lg:px-0">
        <div className="max-w-5xl">
          <BookmarkDuplicateCleanupSection />
        </div>
      </section>
    </div>
  );
}
