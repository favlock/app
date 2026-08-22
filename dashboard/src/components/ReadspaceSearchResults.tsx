import { ArrowRight, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReadspaceSearchPage } from "../lib/readspaceSearch";

export default function ReadspaceSearchResults({
  result,
  query,
}: {
  result: ReadspaceSearchPage;
  query: string;
}) {
  if (result.total === 0) return null;

  const buildUrl = (entryId?: string) => {
    const searchParams = new URLSearchParams({ q: query });
    if (entryId) searchParams.set("open", entryId);
    return `/readspace?${searchParams.toString()}`;
  };

  return (
    <section
      className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_86%,white)] p-3 shadow-[0_5px_0_color-mix(in_oklab,var(--app-line)_8%,transparent)] sm:p-4"
      aria-labelledby="readspace-search-results-title"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-amber-500/12 text-amber-700">
            <BookOpen size={16} aria-hidden="true" />
          </span>
          <div>
            <h2
              id="readspace-search-results-title"
              className="text-sm font-bold text-[var(--app-ink)]"
            >
              Matching Readspace articles
            </h2>
            <p className="text-xs text-[var(--app-muted)]">
              {result.total === 1
                ? "1 article"
                : `${result.total.toLocaleString("en-US")} articles`}
            </p>
          </div>
        </div>
        <Link
          to={buildUrl()}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--app-primary)] hover:underline"
        >
          View all
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {result.matches.slice(0, 3).map(({ article, excerpt }) => (
          <li key={article.entry.id}>
            <Link
              to={buildUrl(article.entry.id)}
              className="group flex h-full min-h-24 gap-3 rounded-lg border border-[color-mix(in_oklab,var(--app-line)_11%,transparent)] bg-white/66 p-3 transition hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--app-primary)_24%,transparent)] hover:bg-white/88"
            >
              <BookOpen
                size={17}
                className="mt-0.5 flex-none text-amber-700"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[var(--app-ink)] group-hover:text-[var(--app-primary)]">
                  {article.entry.title}
                </span>
                {excerpt ? (
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--app-muted)]">
                    {excerpt}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
