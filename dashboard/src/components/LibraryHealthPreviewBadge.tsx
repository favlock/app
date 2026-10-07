import { useSharedDuplicatePreview } from "../context/useSharedDuplicatePreview";

const PRO_BADGE_CLASS =
  "rounded-md border border-[color-mix(in_oklab,var(--app-primary)_18%,transparent)] bg-[var(--app-lavender)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--app-primary)]";

export default function LibraryHealthPreviewBadge() {
  const preview = useSharedDuplicatePreview();

  if (preview.status === "ready" && preview.duplicateCount > 0) {
    const count = preview.duplicateCount.toLocaleString();
    const label = `${count} duplicate ${preview.duplicateCount === 1 ? "bookmark" : "bookmarks"} found. Review with FavLock Pro.`;
    return (
      <span
        className="flex shrink-0 items-center gap-1"
        title={label}
        aria-label={label}
      >
        <span
          className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-300"
          aria-hidden="true"
        >
          {count}
        </span>
        <span className={PRO_BADGE_CLASS} aria-hidden="true">
          Pro
        </span>
      </span>
    );
  }

  return (
    <span className={PRO_BADGE_CLASS} aria-label="FavLock Pro feature">
      Pro
    </span>
  );
}
