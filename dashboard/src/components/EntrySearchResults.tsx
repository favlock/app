import {
  ArrowRight,
  CheckCircle2,
  Circle,
  FileText,
  ListTodo,
  StickyNote,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { EntrySearchMatch } from "../lib/entrySearch";
import type { EntryKind, Todo } from "../types/bookmark";

interface EntrySearchResultsProps {
  kind: EntryKind;
  matches: EntrySearchMatch[];
  query: string;
}

function isCompletedTodo(kind: EntryKind, entry: EntrySearchMatch["entry"]): boolean {
  return kind === "todo" && (entry as Todo).is_completed;
}

export default function EntrySearchResults({
  kind,
  matches,
  query,
}: EntrySearchResultsProps) {
  if (matches.length === 0) return null;

  const isTodo = kind === "todo";
  const singular = isTodo ? "task" : "note";
  const plural = isTodo ? "tasks" : "notes";
  const route = isTodo ? "/tasks" : "/notes";
  const titleId = `${kind}-search-results-title`;
  const buildUrl = (entryId?: string) => {
    const searchParams = new URLSearchParams({ q: query });
    if (entryId) searchParams.set("open", entryId);
    return `${route}?${searchParams.toString()}`;
  };

  return (
    <section
      className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_86%,white)] p-3 shadow-[0_5px_0_color-mix(in_oklab,var(--app-line)_8%,transparent)] sm:p-4"
      aria-labelledby={titleId}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex size-8 items-center justify-center rounded-lg ${
              isTodo
                ? "bg-emerald-500/12 text-emerald-700"
                : "bg-[color-mix(in_oklab,var(--app-primary)_12%,white)] text-[var(--app-primary)]"
            }`}
          >
            {isTodo ? (
              <ListTodo size={16} aria-hidden="true" />
            ) : (
              <StickyNote size={16} aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 id={titleId} className="text-sm font-bold text-[var(--app-ink)]">
              Matching {plural}
            </h2>
            <p className="text-xs text-[var(--app-muted)]">
              {matches.length === 1 ? `1 ${singular}` : `${matches.length} ${plural}`}
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
        {matches.slice(0, 3).map(({ entry, excerpt }) => {
          const isCompleted = isCompletedTodo(kind, entry);
          return (
            <li key={entry.id}>
              <Link
                to={buildUrl(entry.id)}
                className="group flex h-full min-h-24 gap-3 rounded-lg border border-[color-mix(in_oklab,var(--app-line)_11%,transparent)] bg-white/66 p-3 transition hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--app-primary)_24%,transparent)] hover:bg-white/88"
              >
                {isTodo ? (
                  isCompleted ? (
                    <CheckCircle2
                      size={18}
                      className="mt-0.5 flex-none text-emerald-600"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      size={18}
                      className="mt-0.5 flex-none text-[var(--app-primary)]"
                      aria-hidden="true"
                    />
                  )
                ) : (
                  <FileText
                    size={17}
                    className="mt-0.5 flex-none text-[var(--app-primary)]"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0">
                  <span
                    className={`block truncate text-sm font-bold text-[var(--app-ink)] group-hover:text-[var(--app-primary)] ${
                      isCompleted ? "line-through opacity-60" : ""
                    }`}
                  >
                    {entry.title}
                  </span>
                  {excerpt ? (
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--app-muted)]">
                      {excerpt}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
