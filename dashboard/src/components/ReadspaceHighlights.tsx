import { Download, ExternalLink, Highlighter, ListChecks, LoaderCircle, MessageSquareText, Trash2, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Bookmark } from "../types/bookmark";
import type { ReadspaceContent } from "../lib/readspaceContent";
import type { ReadspaceEntry } from "../types/bookmark";
import type {
  HighlightBulkDeleteResult,
  WebHighlight,
} from "../hooks/useHighlightsQuery";
import { Button } from "./ui/button";
import ProFeatureTooltip from "./ProFeatureTooltip";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

const colorClasses = {
  yellow: "border-amber-300 bg-amber-100/80 dark:bg-[var(--app-butter)]",
  green: "border-emerald-300 bg-emerald-100/80 dark:bg-[var(--app-mint)]",
  blue: "border-sky-300 bg-sky-100/80 dark:bg-[var(--app-sky)]",
  pink: "border-pink-300 bg-pink-100/80",
} as const;

const highlightColors = [
  { value: "yellow", label: "Yellow", className: "bg-amber-300" },
  { value: "green", label: "Green", className: "bg-emerald-300" },
  { value: "blue", label: "Blue", className: "bg-sky-300" },
  { value: "pink", label: "Pink", className: "bg-pink-300" },
] as const;

export function CollapsibleAnnotation({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const textId = useId();

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;

    const measureOverflow = () => {
      setCanExpand(element.scrollHeight > element.clientHeight + 1);
    };

    measureOverflow();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measureOverflow);
    resizeObserver?.observe(element);
    window.addEventListener("resize", measureOverflow);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureOverflow);
    };
  }, [expanded, text]);

  return <div className="min-w-0 flex-1">
    <p
      id={textId}
      ref={textRef}
      className={`whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"}`}
    >
      {text}
    </p>
    {canExpand ? <button
      type="button"
      aria-controls={textId}
      aria-expanded={expanded}
      onClick={() => setExpanded((current) => !current)}
      className="mt-1 rounded text-xs font-semibold text-[var(--app-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)] focus-visible:ring-offset-2"
    >
      {expanded ? "See less" : "See more"}
    </button> : null}
  </div>;
}

export default function ReadspaceHighlights({
  highlights,
  bookmarks,
  articles = [],
  query,
  loading,
  error,
  deletingId,
  annotatingId,
  coloringId,
  annotationDisabled,
  annotationProRequired = false,
  onRetry,
  onDelete,
  onDeleteSelected,
  onAnnotate,
  onColorChange,
  onExport,
  onOpenArticle,
}: {
  highlights: WebHighlight[];
  bookmarks: Bookmark[];
  articles?: Array<{ entry: ReadspaceEntry; content: ReadspaceContent }>;
  query: string;
  loading: boolean;
  error: boolean;
  deletingId: string | null;
  annotatingId: string | null;
  coloringId: string | null;
  annotationDisabled: boolean;
  annotationProRequired?: boolean;
  onRetry: () => void;
  onDelete: (highlight: WebHighlight) => void;
  onDeleteSelected: (highlights: WebHighlight[]) => Promise<HighlightBulkDeleteResult>;
  onAnnotate: (highlight: WebHighlight) => void;
  onColorChange: (highlight: WebHighlight, color: WebHighlight["payload"]["color"]) => void;
  onExport: (highlights: WebHighlight[], scopeLabel: string) => void;
  onOpenArticle?: (entryId: string) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteSelection, setDeleteSelection] = useState<WebHighlight[] | null>(null);
  const [deleteSelectionSourceTitle, setDeleteSelectionSourceTitle] = useState<string | null>(null);
  const [deleteSelectionError, setDeleteSelectionError] = useState<string | null>(null);
  const [deletingSelection, setDeletingSelection] = useState(false);
  const bookmarkById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const articleById = new Map(articles.map((article) => [article.entry.id, article]));
  const normalizedQuery = query
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const searchTerms = normalizedQuery.split(" ").filter(Boolean);
  const visible = highlights.filter((highlight) => {
    const bookmark = highlight.bookmarkId ? bookmarkById.get(highlight.bookmarkId) : null;
    const article = highlight.entryId ? articleById.get(highlight.entryId) : null;
    const searchableText = [highlight.payload.quote.exact, highlight.payload.note, bookmark?.title, bookmark?.url, article?.entry.title, article?.content.sourceUrl]
      .filter(Boolean)
      .join(" ")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/\s+/g, " ");
    return searchTerms.length === 0 || searchTerms.every((term) => searchableText.includes(term));
  });
  const highlightsBySource = new Map<string, WebHighlight[]>();
  for (const highlight of visible) {
    const sourceId = highlight.bookmarkId ?? highlight.entryId!;
    const group = highlightsBySource.get(sourceId) ?? [];
    group.push(highlight);
    highlightsBySource.set(sourceId, group);
  }
  const selectedHighlights = visible.filter((highlight) => selectedIds.has(highlight.id));

  const toggleSelected = (highlightIds: string[], checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const highlightId of highlightIds) {
        if (checked) next.add(highlightId);
        else next.delete(highlightId);
      }
      return next;
    });
  };

  const leaveSelection = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const confirmSelectionDelete = async () => {
    if (!deleteSelection?.length) return;
    setDeletingSelection(true);
    setDeleteSelectionError(null);
    try {
      const result = await onDeleteSelected(deleteSelection);
      if (result.failedIds.length) {
        const failedIds = new Set(result.failedIds);
        const failedHighlights = deleteSelection.filter((highlight) =>
          failedIds.has(highlight.id),
        );
        setDeleteSelection(failedHighlights);
        setDeleteSelectionSourceTitle(null);
        setSelectedIds(failedIds);
        setDeleteSelectionError(
          result.deletedIds.length
            ? `${result.deletedIds.length.toLocaleString()} ${result.deletedIds.length === 1 ? "highlight" : "highlights"} moved to Trash. ${result.failedIds.length.toLocaleString()} could not be moved. Try again.`
            : "Could not move the selected highlights to Trash. Try again.",
        );
        return;
      }
      setDeleteSelection(null);
      setDeleteSelectionSourceTitle(null);
      leaveSelection();
    } catch {
      setDeleteSelectionError("Could not move the selected highlights to Trash. Try again.");
    } finally {
      setDeletingSelection(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--app-muted)]" role="status"><LoaderCircle className="size-4 animate-spin" /> Loading highlights…</div>;
  if (error) return <div className="rounded-xl bg-red-500/10 p-5 text-sm text-red-700 dark:text-red-300" role="alert"><p>Could not load highlights.</p><Button type="button" outline className="mt-3" onClick={onRetry}>Try again</Button></div>;
  if (!highlights.length) return <div className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_88%,var(--app-highlight))] px-5 py-14 text-center"><Highlighter size={42} className="mx-auto text-[var(--app-primary)]" /><h3 className="mt-4 text-xl font-bold">No highlights yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--app-muted)]">Select text in a saved article, or select text on a web page and choose Save highlight from the right-click menu.</p></div>;
  if (!visible.length) return <div className="rounded-xl bg-[var(--app-highlight)]/55 px-5 py-10 text-center text-sm text-[var(--app-muted)]">No highlights match “{query.trim()}”.</div>;

  return <>
  <div>
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
      {selecting ? <>
        <p className="mr-auto text-sm text-[var(--app-muted)]" role="status">
          {selectedHighlights.length.toLocaleString()} selected
        </p>
        <Button type="button" outline onClick={() => toggleSelected(visible.map((highlight) => highlight.id), selectedHighlights.length !== visible.length)}>
          {selectedHighlights.length === visible.length ? "Clear all" : "Select all"}
        </Button>
        <Button type="button" color="emerald" disabled={!selectedHighlights.length} onClick={() => onExport(selectedHighlights, "Selected highlights")}>
          <Download className="size-4" aria-hidden="true" /> Export selected
        </Button>
        <Button
          type="button"
          color="red"
          disabled={!selectedHighlights.length}
          onClick={() => {
            setDeleteSelectionError(null);
            setDeleteSelectionSourceTitle(null);
            setDeleteSelection(selectedHighlights);
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {selectedHighlights.length === visible.length ? "Delete all" : "Delete selected"}
        </Button>
        <Button type="button" plain aria-label="Cancel selection" title="Cancel selection" onClick={leaveSelection}><X className="size-4" /></Button>
      </> : <>
        <Button type="button" outline onClick={() => { setSelecting(true); setSelectedIds(new Set()); }}>
          <ListChecks className="size-4" aria-hidden="true" /> Select
        </Button>
        <Button type="button" color="emerald" onClick={() => onExport(visible, normalizedQuery ? "Current search results" : "All highlights")}>
          <Download className="size-4" aria-hidden="true" /> {normalizedQuery ? "Export results" : "Export all"}
        </Button>
      </>}
    </div>
    <div className="space-y-3">{[...highlightsBySource].map(([sourceId, groupedHighlights]) => {
    const bookmark = bookmarkById.get(sourceId);
    const article = articleById.get(sourceId);
    const sourceTitle = bookmark?.title ?? article?.entry.title ?? "Saved source";
    const sourceUrl = bookmark?.url ?? article?.content.sourceUrl ?? null;
    const groupIds = groupedHighlights.map((highlight) => highlight.id);
    const selectedInGroup = groupIds.filter((id) => selectedIds.has(id)).length;
    return <article key={sourceId} className="app-surface overflow-hidden rounded-xl">
      <header className="flex items-center justify-between gap-3 border-b border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] px-4 py-2.5">
        {selecting ? <input
          type="checkbox"
          aria-label={`Select all highlights from ${sourceTitle}`}
          checked={selectedInGroup === groupIds.length}
          ref={(element) => { if (element) element.indeterminate = selectedInGroup > 0 && selectedInGroup < groupIds.length; }}
          onChange={(event) => toggleSelected(groupIds, event.target.checked)}
          className="size-4 flex-none accent-[var(--app-primary)]"
        /> : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--app-ink)]">{sourceTitle}</h3>
          <p className="truncate text-xs text-[var(--app-muted)]">{sourceUrl ?? "Source unavailable"}</p>
        </div>
        <div className="flex flex-none items-center gap-1">
          {!selecting ? <Button type="button" plain className="size-10! p-0! sm:size-9!" aria-label="Export highlights from this source" title="Export source highlights" onClick={() => onExport(groupedHighlights, sourceTitle)}><Download className="size-4" /></Button> : null}
          {!selecting ? <Button
            type="button"
            plain
            className="size-10! p-0! sm:size-9!"
            aria-label={`Delete all highlights from ${sourceTitle}`}
            title="Delete all highlights from this source"
            onClick={() => {
              setDeleteSelectionError(null);
              setDeleteSelectionSourceTitle(sourceTitle);
              setDeleteSelection(groupedHighlights);
            }}
          ><Trash2 className="size-4" /></Button> : null}
          {article ? <Button type="button" plain className="size-10! p-0! sm:size-9!" aria-label="Open saved article" title="Open saved article" onClick={() => onOpenArticle?.(article.entry.id)}><ExternalLink className="size-4" /></Button> : sourceUrl ? <Button type="button" plain className="size-10! p-0! sm:size-9!" aria-label="Open source page" title="Open source page" onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="size-4" /></Button> : null}
        </div>
      </header>
      <ul className="divide-y divide-[color-mix(in_oklab,var(--app-line)_12%,transparent)]">
        {groupedHighlights.map((highlight) => <li key={highlight.id} className="px-3 py-3 sm:px-4">
          <div className="flex items-start gap-3">
            {selecting ? <input
              type="checkbox"
              aria-label="Select highlight"
              checked={selectedIds.has(highlight.id)}
              onChange={(event) => toggleSelected([highlight.id], event.target.checked)}
              className="mt-2.5 size-4 flex-none accent-[var(--app-primary)]"
            /> : null}
            <blockquote className={`min-w-0 flex-1 rounded-md border-l-[3px] px-3 py-2 text-sm leading-5 text-[var(--app-ink)] ${colorClasses[highlight.payload.color]}`}>{highlight.payload.quote.exact}</blockquote>
          </div>
          {highlight.payload.note || !selecting ? <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          {highlight.payload.note ? <div className="flex min-w-0 flex-1 items-start gap-2 text-sm leading-5 text-[var(--app-muted)]"><MessageSquareText className="mt-0.5 size-4 flex-none" aria-hidden="true" /><CollapsibleAnnotation text={highlight.payload.note} /></div> : <div className="hidden flex-1 sm:block" />}
          {!selecting ? <div className="flex flex-none flex-wrap items-center justify-end gap-0.5">
          <div className="mr-0.5 flex items-center" role="group" aria-label="Highlight color">
            {highlightColors.map((color) => {
              const selected = highlight.payload.color === color.value;
              return <button
                key={color.value}
                type="button"
                aria-label={`${color.label} highlight`}
                aria-pressed={selected}
                title={`${color.label} highlight`}
                disabled={coloringId === highlight.id || selected}
                onClick={() => onColorChange(highlight, color.value)}
                className="grid size-9 place-items-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)] focus-visible:ring-offset-1 disabled:cursor-default"
              ><span className={`size-[1.125rem] rounded-full border border-black/10 ${color.className} ${selected ? "ring-2 ring-[var(--app-ink)] ring-offset-1" : ""}`} /></button>;
            })}
          </div>
          <Button type="button" plain className="size-10! p-0! sm:size-9!" aria-label="Export this highlight" title="Export this highlight" onClick={() => onExport([highlight], "One highlight")}><Download className="size-4" /></Button>
          <ProFeatureTooltip active={annotationProRequired}>
            <Button type="button" plain className="size-10! p-0! sm:size-9!" aria-label={highlight.payload.note ? "Edit annotation" : "Add annotation"} disabled={annotationDisabled || annotationProRequired || annotatingId === highlight.id} onClick={() => onAnnotate(highlight)}>{annotatingId === highlight.id ? <LoaderCircle className="size-4 animate-spin" /> : <MessageSquareText className="size-4" />}</Button>
          </ProFeatureTooltip>
          <Button type="button" plain className="size-10! p-0! sm:size-9!" aria-label="Delete highlight" disabled={deletingId === highlight.id} onClick={() => onDelete(highlight)}>{deletingId === highlight.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button>
          </div>
          : null}
          </div> : null}
        </li>)}
      </ul>
    </article>;
  })}</div>
  </div>
  <Dialog
    open={!!deleteSelection}
    onClose={() => {
      if (deletingSelection) return;
      setDeleteSelection(null);
      setDeleteSelectionSourceTitle(null);
      setDeleteSelectionError(null);
    }}
    size="sm"
  >
    <DialogTitle>
      {deleteSelectionSourceTitle
        ? `Move all highlights from “${deleteSelectionSourceTitle}” to Trash?`
        : `Move ${deleteSelection?.length.toLocaleString()} selected ${deleteSelection?.length === 1 ? "highlight" : "highlights"} to Trash?`}
    </DialogTitle>
    <DialogDescription>
      You can restore them during your plan’s recovery period. Their source pages and saved articles remain available.
    </DialogDescription>
    {deleteSelectionError ? (
      <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">{deleteSelectionError}</p>
    ) : null}
    <DialogActions>
      <Button type="button" plain disabled={deletingSelection} onClick={() => {
        setDeleteSelection(null);
        setDeleteSelectionSourceTitle(null);
      }}>
        Cancel
      </Button>
      <Button type="button" color="red" disabled={deletingSelection} onClick={() => void confirmSelectionDelete()}>
        {deletingSelection ? "Moving…" : "Move to Trash"}
      </Button>
    </DialogActions>
  </Dialog>
  </>;
}
