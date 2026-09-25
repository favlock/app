import { ArrowRight, Highlighter } from "lucide-react";
import { Link } from "react-router-dom";
import type { HighlightSearchMatch } from "../lib/highlightSearch";
import { useState } from "react";

export default function HighlightSearchResults({
  matches,
  query,
  refined = false,
}: {
  matches: HighlightSearchMatch[];
  query: string;
  refined?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!matches.length) return null;
  const searchParams = new URLSearchParams({ view: "highlights", q: query });
  const target = `/readspace?${searchParams.toString()}`;

  return (
    <section
      className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_86%,var(--app-highlight))] p-3 shadow-[0_5px_0_color-mix(in_oklab,var(--app-line)_8%,transparent)] sm:p-4"
      aria-labelledby="highlight-search-results-title"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-yellow-500/14 text-amber-700 dark:text-amber-300">
            <Highlighter size={16} aria-hidden="true" />
          </span>
          <div>
            <h2 id="highlight-search-results-title" className="text-sm font-bold text-[var(--app-ink)]">
              Matching highlights
            </h2>
            <p className="text-xs text-[var(--app-muted)]">
              {matches.length === 1 ? "1 highlight" : `${matches.length.toLocaleString()} highlights`}
            </p>
          </div>
        </div>
        {!refined ? <Link to={target} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--app-primary)] hover:underline">
          View all <ArrowRight size={15} aria-hidden="true" />
        </Link> : null}
      </div>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {(showAll ? matches : matches.slice(0, 3)).map(({ highlight, sourceTitle }) => (
          <li key={highlight.id}>
            <Link
              to={refined ? `/readspace?view=highlights&open=${encodeURIComponent(highlight.id)}` : target}
              className="group flex h-full min-h-24 gap-3 rounded-lg border border-[color-mix(in_oklab,var(--app-line)_11%,transparent)] bg-[var(--app-highlight)]/66 p-3 transition hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--app-primary)_24%,transparent)] hover:bg-[var(--app-highlight)]/88"
            >
              <span className="mt-1 size-2.5 shrink-0 rounded-full bg-amber-300" aria-hidden="true" />
              <span className="min-w-0">
                <span className="line-clamp-2 block text-sm font-semibold leading-5 text-[var(--app-ink)] group-hover:text-[var(--app-primary)]">
                  {highlight.payload.quote.exact}
                </span>
                <span className="mt-1 block truncate text-xs text-[var(--app-muted)]">
                  {sourceTitle}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {matches.length > 3 && !showAll ? (
        <button type="button" onClick={() => setShowAll(true)} className="mt-3 min-h-10 text-sm font-semibold text-[var(--app-primary)] hover:underline">
          Show all {matches.length} matching highlights
        </button>
      ) : null}
    </section>
  );
}
