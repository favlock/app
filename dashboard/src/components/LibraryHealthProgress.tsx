import { useEffect, useState } from "react";
import { Check, Copy, Link2Off, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useDuplicateScan } from "../context/useDuplicateScan";
import { useLinkHealth } from "../context/useLinkHealth";

export default function LibraryHealthProgress() {
  const duplicate = useDuplicateScan();
  const links = useLinkHealth();
  const [visible, setVisible] = useState(false);
  const scanning =
    duplicate.phase === "scanning" || links.phase === "scanning";
  const completed =
    duplicate.phase === "complete" || links.phase === "complete";

  useEffect(() => {
    if (scanning) {
      setVisible(true);
      return;
    }
    if (!completed) return;
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 3_000);
    return () => window.clearTimeout(timeout);
  }, [completed, duplicate.runId, links.runId, scanning]);

  if (!visible || (!scanning && !completed)) return null;

  const duplicateActive = duplicate.phase === "scanning";
  const linksActive = links.phase === "scanning";
  const scanned =
    (duplicateActive ? duplicate.deviceState.scannedCount : 0) +
    (linksActive ? links.deviceState.scannedCount : 0);
  const total =
    (duplicateActive ? duplicate.deviceState.totalCount : 0) +
    (linksActive ? links.deviceState.totalCount : 0);
  const progress = scanning
    ? total > 0
      ? Math.round((scanned / total) * 100)
      : 0
    : 100;
  const title = duplicateActive && linksActive
    ? "Checking library health"
    : duplicateActive
      ? "Scanning for duplicates"
      : linksActive
        ? "Checking links"
        : "Library health updated";

  return (
    <aside
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-card)] p-4 shadow-xl"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 flex-none items-center justify-center rounded-xl bg-[var(--app-lavender)] text-[var(--app-primary)]">
          {scanning ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--app-ink)]">{title}</p>
            <span className="text-xs font-semibold tabular-nums text-[var(--app-muted)]">
              {progress}%
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--app-muted)]">
            {scanning
              ? `${scanned.toLocaleString()} of ${total.toLocaleString()} checks completed`
              : `${duplicate.deviceState.duplicateCount.toLocaleString()} duplicates · ${links.deviceState.brokenCount.toLocaleString()} broken links`}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--app-line)_12%,transparent)]" aria-hidden="true">
            <div
              className="h-full rounded-full bg-[var(--app-primary)] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          {!scanning ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {duplicate.deviceState.duplicateCount > 0 ? (
                <Link to="/duplicates" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--app-primary)] underline-offset-4 hover:underline">
                  <Copy size={13} aria-hidden="true" /> Review duplicates
                </Link>
              ) : null}
              {links.deviceState.brokenCount > 0 ? (
                <Link to="/broken-links" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--app-primary)] underline-offset-4 hover:underline">
                  <Link2Off size={13} aria-hidden="true" /> Review broken links
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
