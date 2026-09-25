import { LayoutGrid, List } from "lucide-react";
import type { LibraryLayout } from "../hooks/useLibraryLayout";

export default function LibraryLayoutControl({ layout, onChange }: {
  layout: LibraryLayout;
  onChange: (layout: LibraryLayout) => void;
}) {
  return (
    <div className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_15%,transparent)] bg-[var(--app-reading)] p-1" role="group" aria-label="Library layout">
      <button type="button" onClick={() => onChange("cards")} aria-label="Cards layout" aria-pressed={layout === "cards"} title="Cards"
        className={`flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] ${layout === "cards" ? "bg-[var(--app-card)] text-[var(--app-ink)] shadow-sm dark:bg-[var(--app-primary)] dark:text-[var(--app-on-primary)]" : "text-[var(--app-muted)] hover:text-[var(--app-ink)]"}`}>
        <LayoutGrid size={18} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onChange("compact")} aria-label="Compact list layout" aria-pressed={layout === "compact"} title="Compact list"
        className={`flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] ${layout === "compact" ? "bg-[var(--app-card)] text-[var(--app-ink)] shadow-sm dark:bg-[var(--app-primary)] dark:text-[var(--app-on-primary)]" : "text-[var(--app-muted)] hover:text-[var(--app-ink)]"}`}>
        <List size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
