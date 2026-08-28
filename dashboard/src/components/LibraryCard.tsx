import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { BookOpen, Bookmark, ListTodo, StickyNote } from "lucide-react";

interface LibraryCardProps {
  kind: "bookmark" | "note" | "read" | "todo";
  meta?: ReactNode;
  title: ReactNode;
  details: ReactNode;
  category: ReactNode;
  actions: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  raised?: boolean;
}

export default function LibraryCard({
  kind,
  meta,
  title,
  details,
  category,
  actions,
  onClick,
  raised = false,
}: LibraryCardProps) {
  const isNote = kind === "note";
  const isTodo = kind === "todo";
  const isRead = kind === "read";
  const TypeIcon = isNote
    ? StickyNote
    : isTodo
      ? ListTodo
      : isRead
        ? BookOpen
        : Bookmark;

  return (
    <article
      onClick={onClick}
      className={`group relative isolate h-full ${kind === "bookmark" ? "min-h-40 p-3" : "min-h-44 p-3"} cursor-pointer rounded-[1.05rem] border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_84%,white)] shadow-[0_1px_2px_color-mix(in_oklab,var(--app-line)_6%,transparent),0_14px_30px_-28px_color-mix(in_oklab,var(--app-line)_38%,transparent)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-[color-mix(in_oklab,var(--app-primary)_28%,transparent)] hover:bg-[color-mix(in_oklab,var(--app-card)_72%,white)] hover:shadow-[0_2px_5px_color-mix(in_oklab,var(--app-line)_8%,transparent),0_18px_36px_-28px_color-mix(in_oklab,var(--app-line)_44%,transparent)] focus-within:border-[color-mix(in_oklab,var(--app-primary)_44%,transparent)] focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_12%,transparent)] ${raised ? "z-40" : "z-0"}`}
    >
      <div className="grid h-full grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
              isNote
                ? "border-[color-mix(in_oklab,var(--app-accent)_28%,transparent)] bg-[color-mix(in_oklab,var(--app-accent)_13%,white)] text-[color-mix(in_oklab,var(--app-accent)_70%,var(--app-ink))]"
                : isTodo
                  ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-700"
                  : isRead
                    ? "border-teal-700/25 bg-teal-600/10 text-teal-800"
                    : "border-[color-mix(in_oklab,var(--app-secondary)_20%,transparent)] bg-[color-mix(in_oklab,var(--app-secondary)_10%,white)] text-[var(--app-secondary)]"
            }`}
          >
            <TypeIcon size={12} aria-hidden="true" />
            {isNote ? "Document" : isTodo ? "Task" : isRead ? "Read" : "Bookmark"}
          </span>
          {meta ? (
            <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-[#ffefcb] px-1.5 py-0.5 text-xs font-medium text-[#4f5566]">
              {meta}
            </div>
          ) : null}
        </div>

        <h3 className="min-w-0 truncate text-[0.95rem] font-semibold leading-5 text-[var(--app-ink)]">
          {title}
        </h3>

        <div className="min-h-0">{details}</div>

        <div className="flex min-h-9 items-center justify-between gap-2 border-t border-[color-mix(in_oklab,var(--app-line)_8%,transparent)] pt-2">
          <div className="min-w-0">{category}</div>
          <div className="flex flex-none items-center gap-1">{actions}</div>
        </div>
      </div>
    </article>
  );
}
