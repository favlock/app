import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { BookOpen, Bookmark, ListTodo, StickyNote } from "lucide-react";

import { COLOR_MAP, COLLECTION_SURFACE_MAP, type ColorConstant } from "../constants/colors";

interface LibraryCardProps {
  collectionColor?: ColorConstant | null;
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
  collectionColor,
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

  const color = collectionColor ?? "NONE";
  const cardStyle: CSSProperties & { "--card-fill": string; "--card-border": string } = {
    "--card-fill": color !== "NONE" && COLLECTION_SURFACE_MAP[color]
      ? `color-mix(in oklab, ${COLLECTION_SURFACE_MAP[color]} 55%, var(--app-reading))`
      : "var(--app-reading)",
    "--card-border": color !== "NONE" && COLOR_MAP[color]
      ? `color-mix(in oklab, ${COLOR_MAP[color]} 65%, var(--app-reading))`
      : "color-mix(in oklab, var(--app-line) 14%, transparent)",
  };

  return (
    <article
      style={cardStyle}
      onClick={onClick}
      className={`library-card group relative isolate h-full min-w-0 w-full ${kind === "bookmark" ? "min-h-40" : "min-h-44"} cursor-pointer p-4 ${raised ? "z-40" : "z-0"}`}
    >
      <div className="grid h-full min-w-0 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className="library-card-badge inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold"
          >
            <TypeIcon size={12} aria-hidden="true" />
            {isNote ? "Document" : isTodo ? "Task" : isRead ? "Read" : "Bookmark"}
          </span>
          {meta ? (
            <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-[var(--app-highlight)]/60 px-1.5 py-0.5 text-xs font-medium text-[var(--app-muted)]">
              {meta}
            </div>
          ) : null}
        </div>

        <h3 className="min-w-0 truncate text-[0.95rem] font-semibold leading-5 text-[var(--app-ink)]">
          {title}
        </h3>

        <div className="min-h-0 min-w-0">{details}</div>

        <div className="flex min-h-9 min-w-0 items-center justify-between gap-2 border-t border-[color-mix(in_oklab,var(--app-line)_8%,transparent)] pt-2">
          <div className="min-w-0">{category}</div>
          <div className="flex flex-none items-center gap-1">{actions}</div>
        </div>
      </div>
    </article>
  );
}
