import { useContext, useEffect, useId, useState } from "react";
import { LibrarySelectionContext } from "../context/LibrarySelectionContext";
import type { LibraryItemSelection } from "../context/LibrarySelectionContext";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { BookOpen, Bookmark, ListTodo, MoreHorizontal, StickyNote } from "lucide-react";
import type { LibraryLayout } from "../hooks/useLibraryLayout";

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
  layout?: LibraryLayout;
  compactSummary?: ReactNode;
  compactSelection?: LibraryItemSelection;
  compactActionsLabel?: string;
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
  layout = "cards",
  compactSummary,
  compactSelection,
  compactActionsLabel,
}: LibraryCardProps) {
  const selection = useContext(LibrarySelectionContext);
  const rowSelection = selection ?? compactSelection;
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsId = useId();

  useEffect(() => {
    if (layout !== "compact" || rowSelection) setActionsOpen(false);
  }, [layout, rowSelection]);
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

  if (layout === "compact") {
    return (
      <article style={cardStyle}
        onKeyDown={(event) => {
          if (event.key === "Escape" && actionsOpen) {
            event.stopPropagation();
            setActionsOpen(false);
          }
        }}
        onClick={(event) => {
          if (!rowSelection) return onClick(event);
          if (!rowSelection.disabled && !(event.target instanceof Element && event.target.closest("label, input, button"))) rowSelection.toggle(event.shiftKey);
        }}
        className={`library-card relative min-w-0 w-full cursor-pointer px-3 py-2 ${raised || actionsOpen ? "z-40" : "z-0"} ${rowSelection?.checked ? "ring-2 ring-[var(--app-primary)]" : ""}`}>
        <div className="flex min-h-14 min-w-0 items-center gap-3">
          <span className="library-card-badge flex size-9 shrink-0 items-center justify-center rounded-xl" title={isNote ? "Document" : isTodo ? "Task" : isRead ? "Read" : "Bookmark"}>
            <TypeIcon size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1" inert={!!rowSelection} style={rowSelection ? { pointerEvents: "none" } : undefined}>
            <h3 className="min-w-0 truncate text-sm font-semibold leading-5 text-[var(--app-ink)]">{title}</h3>
            <p className="min-w-0 truncate text-xs leading-5 text-[var(--app-muted)]">
              {isNote ? "Document" : isTodo ? "Task" : isRead ? "Read" : "Bookmark"}{compactSummary ? <> · {compactSummary}</> : null}
            </p>
          </div>
          {!rowSelection && kind === "bookmark" && meta ? <span className="shrink-0 text-[var(--app-muted)]">{meta}</span> : null}
          {rowSelection ? <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <input type="checkbox" checked={rowSelection.checked} disabled={rowSelection.disabled}
              aria-label={`Select item: ${rowSelection.title}`} className="size-5 accent-[var(--app-primary)]"
              onChange={() => rowSelection.toggle(false)} />
          </label> : <button type="button" aria-label={`Actions for ${compactActionsLabel ?? "item"}`} aria-expanded={actionsOpen} aria-controls={actionsId}
            onClick={(event) => { event.stopPropagation(); setActionsOpen((open) => !open); }}
            className="theme-button-icon flex size-11 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2">
            <MoreHorizontal size={19} aria-hidden="true" />
          </button>}
        </div>
        {!rowSelection && actionsOpen ? <div id={actionsId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--card-border)] pt-2" onClick={(event) => event.stopPropagation()}>
          <div className="min-w-0">{category}</div>
          <div className="flex items-center gap-1">{actions}</div>
        </div> : null}
      </article>
    );
  }

  return (
    <article
      style={cardStyle}
      onClick={(event) => {
        if (!selection) return onClick(event);
        if (!selection.disabled && !(event.target instanceof Element && event.target.closest("label, input"))) selection.toggle(event.shiftKey);
      }}
      className={`library-card group relative isolate h-full min-w-0 w-full ${kind === "bookmark" ? "min-h-40" : "min-h-44"} cursor-pointer p-4 ${raised ? "z-40" : "z-0"} ${selection?.checked ? "ring-2 ring-[var(--app-primary)]" : ""}`}
    >
      <div className="grid h-full min-w-0 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className="library-card-badge inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold"
          >
            <TypeIcon size={12} aria-hidden="true" />
            {isNote ? "Document" : isTodo ? "Task" : isRead ? "Read" : "Bookmark"}
          </span>
          {selection ? <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 text-xs font-medium">
            <input type="checkbox" aria-label={`Select item: ${selection.title}`} checked={selection.checked} disabled={selection.disabled}
              className="size-4 accent-[var(--app-primary)]" onChange={() => {}} onClick={(event) => selection.toggle(event.shiftKey)} />
            {selection.checked ? "Selected" : "Select"}
          </label> : meta ? (
            <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-[var(--app-highlight)]/60 px-1.5 py-0.5 text-xs font-medium text-[var(--app-muted)]">
              {meta}
            </div>
          ) : null}
        </div>

        <h3 inert={!!selection} style={selection ? { pointerEvents: "none" } : undefined} className="min-w-0 truncate text-[0.95rem] font-semibold leading-5 text-[var(--app-ink)]">
          {title}
        </h3>

        <div inert={!!selection} style={selection ? { pointerEvents: "none" } : undefined} className="min-h-0 min-w-0">{details}</div>

        <div className="flex min-h-9 min-w-0 items-center justify-between gap-2 border-t border-[color-mix(in_oklab,var(--app-line)_8%,transparent)] pt-2">
          <div inert={!!selection} style={selection ? { pointerEvents: "none" } : undefined} className="min-w-0">{category}</div>
          <div className="flex flex-none items-center gap-1">{selection ? null : actions}</div>
        </div>
      </div>
    </article>
  );
}
