import { Portal } from "@headlessui/react";
import { ExternalLink, FolderIcon, LoaderCircle, MessageSquareText, Tag, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useState, type Ref } from "react";
import {
  useCreateArticleHighlight,
  useDeleteHighlight,
  useHighlights,
  useUpdateHighlightAnnotation,
  useUpdateHighlightColor,
  type WebHighlight,
} from "../hooks/useHighlightsQuery";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { getCollectionBadgeColor } from "../constants/colors";
import { captureArticleSelection, getArticleHighlightMenuPosition, renderArticleHighlights } from "../lib/articleHighlight";
import type { ReadspaceContent } from "../lib/readspaceContent";
import type { WebHighlightColor, WebHighlightPayload } from "../lib/webHighlight";
import type { ReadspaceEntry } from "../types/bookmark";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogActions, DialogDescription, DialogTitle } from "./ui/dialog";
import ProUpgradeDialog from "./ProUpgradeDialog";
import { CollapsibleAnnotation } from "./ReadspaceHighlights";
import { Textarea } from "./ui/textarea";
import HighlightAnnotationEditor from "./HighlightAnnotationEditor";
import ProFeatureTooltip from "./ProFeatureTooltip";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const articleClassName = "select-text py-7 font-serif text-[18px] leading-[1.72] text-zinc-800 sm:text-[19px] [&_a]:font-medium [&_a]:text-[#0f766e] [&_a]:underline [&_a]:decoration-[#0f766e]/35 [&_a]:underline-offset-3 [&_code]:rounded [&_code]:bg-zinc-950/6 [&_code]:px-1 [&_h1]:mb-3 [&_h1]:mt-10 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:leading-tight [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:mb-2 [&_h4]:mt-7 [&_h4]:font-bold [&_li]:my-1.5 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:my-5 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-7";

export const ArticleBody = memo(function ArticleBody({
  articleRef,
  html,
  onSelection,
}: {
  articleRef: Ref<HTMLElement>;
  html: string;
  onSelection: (pointer?: { x: number; y: number }) => void;
}) {
  return (
    <article
      ref={articleRef}
      onMouseUp={(event) => onSelection({ x: event.clientX, y: event.clientY })}
      onKeyUp={() => onSelection()}
      className={articleClassName}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

function sourceDates(content: ReadspaceContent) {
  const published = content.publishedAt
    ? dateFormatter.format(new Date(content.publishedAt))
    : "";
  const updated = content.updatedAt
    ? dateFormatter.format(new Date(content.updatedAt))
    : "";
  return [
    published ? `Published ${published}` : "",
    updated && updated !== published ? `Updated ${updated}` : "",
  ].filter(Boolean);
}

export default function ReadspaceArticleDialog({
  article,
  onClose,
}: {
  article: { entry: ReadspaceEntry; content: ReadspaceContent } | null;
  onClose: () => void;
}) {
  const { data: allHighlights = [] } = useHighlights();
  const { data: accountPlan, isLoading: accountPlanLoading } = useAccountPlan();
  const createHighlight = useCreateArticleHighlight();
  const deleteHighlight = useDeleteHighlight();
  const updateAnnotation = useUpdateHighlightAnnotation();
  const updateColor = useUpdateHighlightColor();
  const articleEntryId = article?.entry.id ?? null;
  const highlights = useMemo(
    () => articleEntryId
      ? allHighlights.filter((highlight) => highlight.entryId === articleEntryId)
      : [],
    [allHighlights, articleEntryId],
  );
  const canAnnotate = accountPlan?.id === "pro";
  const annotationProRequired = !accountPlanLoading && accountPlan?.id === "free";
  const [articleRoot, setArticleRoot] = useState<HTMLElement | null>(null);
  const [selection, setSelection] = useState<{
    payload: WebHighlightPayload;
    left: number;
    top: number;
    maxHeight: number;
    placement: "above" | "below";
  } | null>(null);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [annotation, setAnnotation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [annotationTarget, setAnnotationTarget] = useState<WebHighlight | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebHighlight | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const namespace = useMemo(
    () => articleEntryId?.replace(/[^a-z0-9-]/gi, "") ?? "closed",
    [articleEntryId],
  );

  useEffect(() => {
    setSelection(null);
    setAnnotationOpen(false);
    setAnnotation("");
    setSaveError(null);
    setAnnotationTarget(null);
    setDeleteTarget(null);
    setColorError(null);
  }, [articleEntryId]);

  useLayoutEffect(() => {
    if (!articleRoot || !articleEntryId) return;
    return renderArticleHighlights(
      articleRoot,
      namespace,
      highlights.map((highlight) => highlight.payload),
    );
  }, [articleEntryId, articleRoot, highlights, namespace]);

  const detectSelection = useCallback((pointer?: { x: number; y: number }) => {
    const selected = window.getSelection();
    if (!articleRoot || !selected || selected.rangeCount !== 1 || selected.isCollapsed) {
      setSelection(null);
      return;
    }
    const payload = captureArticleSelection(articleRoot, selected);
    if (!payload) {
      setSelection(null);
      return;
    }
    const rect = selected.getRangeAt(0).getBoundingClientRect();
    const position = getArticleHighlightMenuPosition({
      anchorX: pointer?.x ?? rect.left + rect.width / 2,
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setSelection({
      payload,
      ...position,
    });
    setAnnotationOpen(false);
    setAnnotation("");
    setSaveError(null);
  }, [articleRoot]);

  const saveSelection = async (color: WebHighlightColor, note = "") => {
    if (!selection || !article || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createHighlight.mutateAsync({
        entryId: article.entry.id,
        optimisticId: crypto.randomUUID(),
        payload: {
          ...selection.payload,
          color,
          note: note.trim().slice(0, 10_000),
        },
      });
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      setAnnotationOpen(false);
      setAnnotation("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this highlight.");
    } finally {
      setSaving(false);
    }
  };

  const openAnnotation = (highlight: WebHighlight) => {
    if (!canAnnotate) {
      setUpgradeOpen(true);
      return;
    }
    setAnnotationTarget(highlight);
    setAnnotationText(highlight.payload.note);
    setAnnotationError(null);
  };

  const saveExistingAnnotation = async (note = annotationText) => {
    if (!annotationTarget) return;
    setAnnotationError(null);
    try {
      await updateAnnotation.mutateAsync({ highlight: annotationTarget, note });
      setAnnotationTarget(null);
    } catch (error) {
      setAnnotationError(error instanceof Error ? error.message : "Could not save the annotation.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteHighlight.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete the highlight.");
    }
  };

  const changeColor = async (highlight: WebHighlight, color: WebHighlightColor) => {
    setColorError(null);
    try {
      await updateColor.mutateAsync({ highlight, color });
    } catch (error) {
      setColorError(error instanceof Error ? error.message : "Could not update the highlight color.");
    }
  };

  const metadata = article
    ? [
        article.content.siteName,
        ...sourceDates(article.content),
      ].filter(Boolean)
    : [];

  return <>
    <Dialog
      open={!!article}
      onClose={onClose}
      size="4xl"
      className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-h-[calc(100vh-4rem)]"
    >
      {article ? (
        <>
          <style>{`
            ::highlight(favlock-article-${namespace}-yellow) { background-color: #fde68a; color: inherit; }
            ::highlight(favlock-article-${namespace}-green) { background-color: #bbf7d0; color: inherit; }
            ::highlight(favlock-article-${namespace}-blue) { background-color: #bfdbfe; color: inherit; }
            ::highlight(favlock-article-${namespace}-pink) { background-color: #fbcfe8; color: inherit; }
          `}</style>
          <div className="mx-auto max-w-3xl">
            <DialogTitle>
              <span className="block font-serif text-3xl leading-tight tracking-tight text-zinc-950 sm:text-5xl">
                {article.entry.title}
              </span>
            </DialogTitle>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-zinc-600">
              {metadata.map((item, index) => (
                <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-zinc-300">•</span> : null}
                  <span>{item}</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-2">
                {metadata.length > 0 ? <span className="text-zinc-300">•</span> : null}
                <a
                  href={article.content.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-semibold text-[#0f766e] hover:underline"
                >
                  Original <ExternalLink size={13} aria-hidden="true" />
                </a>
              </span>
            </div>
            {article.entry.folder || article.entry.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-medium text-zinc-600">
                {article.entry.folder ? (
                  <Badge
                    color={getCollectionBadgeColor(article.entry.folder.color)}
                    className="gap-1! rounded-full! px-2.5! py-1! text-xs!"
                  >
                    <FolderIcon size={12} aria-hidden="true" />
                    {article.entry.folder.name}
                  </Badge>
                ) : null}
                {article.entry.tags?.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-500/8 px-2.5 py-1 text-violet-700"
                  >
                    <Tag size={11} aria-hidden="true" />#{tag.name}
                  </span>
                ))}
              </div>
            ) : null}

            {article.content.html ? (
              <ArticleBody
                articleRef={setArticleRoot}
                html={article.content.html}
                onSelection={detectSelection}
              />
            ) : (
              <div className="my-8 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                This older Readspace entry contains only its source details. Open
                the original article to read it.
              </div>
            )}

            {highlights.length ? (
              <section className="mb-8 border-t border-zinc-950/10 pt-5" aria-label="Article highlights">
                <h3 className="text-sm font-semibold text-zinc-950">
                  Highlights ({highlights.length})
                </h3>
                {colorError ? <p className="mt-2 text-xs text-red-600" role="alert">{colorError}</p> : null}
                <ul className="mt-3 space-y-2">
                  {highlights.map((highlight) => (
                    <li key={highlight.id} className="rounded-xl bg-zinc-950/[0.035] p-3">
                      <div className="flex items-start gap-2">
                        <span className={{ yellow: "bg-amber-300", green: "bg-emerald-300", blue: "bg-sky-300", pink: "bg-pink-300" }[highlight.payload.color] + " mt-1 size-2.5 flex-none rounded-full"} />
                        <p className="min-w-0 flex-1 text-sm leading-5 text-zinc-800">{highlight.payload.quote.exact}</p>
                        <ProFeatureTooltip active={annotationProRequired}>
                          <button type="button" disabled={!canAnnotate} className="rounded-md p-1.5 text-zinc-500 hover:bg-white hover:text-[#0f766e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] disabled:cursor-not-allowed disabled:opacity-45" aria-label={highlight.payload.note ? "Edit annotation" : "Add annotation"} onClick={() => openAnnotation(highlight)}>
                            <MessageSquareText className="size-4" />
                          </button>
                        </ProFeatureTooltip>
                        <button type="button" className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600" aria-label="Delete highlight" onClick={() => setDeleteTarget(highlight)}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      {highlight.payload.note ? <div className="mt-2 pl-[18px] text-xs leading-5 text-zinc-600"><CollapsibleAnnotation text={highlight.payload.note} /></div> : null}
                      <div className="mt-2 flex gap-1 pl-[18px]" role="group" aria-label="Highlight color">
                        {([
                          ["yellow", "Yellow", "bg-amber-300"],
                          ["green", "Green", "bg-emerald-300"],
                          ["blue", "Blue", "bg-sky-300"],
                          ["pink", "Pink", "bg-pink-300"],
                        ] as const).map(([color, label, className]) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`${label} highlight`}
                            aria-pressed={highlight.payload.color === color}
                            disabled={updateColor.isPending || highlight.payload.color === color}
                            onClick={() => void changeColor(highlight, color)}
                            className={`size-4 rounded-full border border-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-1 ${className} ${highlight.payload.color === color ? "ring-2 ring-zinc-700 ring-offset-1" : ""}`}
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {selection ? (
            <Portal>
              <div
                role="dialog"
                aria-label="Save article highlight"
                className={`fixed z-[70] -translate-x-1/2 overflow-y-auto rounded-2xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_94%,white)] p-2 shadow-[0_18px_48px_-20px_color-mix(in_oklab,var(--app-line)_48%,transparent),0_4px_14px_-8px_color-mix(in_oklab,var(--app-line)_24%,transparent)] ${annotationOpen ? "w-[min(22rem,calc(100vw-1.5rem))]" : "w-auto max-w-[calc(100vw-1.5rem)]"} ${selection.placement === "above" ? "-translate-y-full" : ""}`}
                style={{ left: selection.left, top: selection.top, maxHeight: selection.maxHeight }}
              >
                <div className="flex items-center gap-1.5" role="group" aria-label="Highlight color">
                  {([
                    ["yellow", "Yellow", "bg-amber-300"],
                    ["green", "Green", "bg-emerald-300"],
                    ["blue", "Blue", "bg-sky-300"],
                    ["pink", "Pink", "bg-pink-300"],
                  ] as const).map(([color, label, className]) => (
                    <button key={color} type="button" disabled={saving} aria-label={`Save ${label.toLowerCase()} highlight`} title={label} onClick={() => void saveSelection(color)} className={`size-8 shrink-0 rounded-full border-4 border-[var(--app-card)] shadow-sm ring-1 ring-[color-mix(in_oklab,var(--app-line)_22%,transparent)] transition-[transform,box-shadow] hover:scale-105 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)] disabled:cursor-wait disabled:opacity-50 ${className}`} />
                  ))}
                  <span className="mx-0.5 h-6 w-px bg-[color-mix(in_oklab,var(--app-line)_13%,transparent)]" />
                  <ProFeatureTooltip active={annotationProRequired}>
                    <button type="button" disabled={saving || !canAnnotate} aria-expanded={annotationOpen} onClick={() => setAnnotationOpen((open) => !open)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${annotationOpen ? "bg-[color-mix(in_oklab,var(--app-primary)_11%,var(--app-card))] text-[var(--app-primary)]" : "text-[var(--app-muted)] hover:bg-[var(--app-card-strong)] hover:text-[var(--app-ink)]"}`}>
                      <MessageSquareText className="size-4" /> Note
                    </button>
                  </ProFeatureTooltip>
                </div>
                {annotationOpen ? (
                  <div className="mt-2 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-[color-mix(in_oklab,var(--app-card-strong)_58%,white)] p-3">
                    <div className="mb-2.5 flex items-start gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))] text-[var(--app-primary)]">
                        <MessageSquareText className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--app-ink)]">Private annotation</p>
                        <p className="text-xs leading-5 text-[var(--app-muted)]">Encrypted before it leaves this browser.</p>
                      </div>
                    </div>
                    <Textarea
                      autoFocus
                      rows={3}
                      maxLength={10_000}
                      resizable={false}
                      value={annotation}
                      onChange={(event) => setAnnotation(event.target.value)}
                      placeholder="Add a note about this passage…"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs tabular-nums text-[var(--app-muted)]">
                        {annotation.length.toLocaleString()} / 10,000
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button type="button" plain disabled={saving} onClick={() => {
                          setAnnotationOpen(false);
                          setAnnotation("");
                        }}>
                          Cancel
                        </Button>
                        <Button type="button" disabled={saving || !annotation.trim()} onClick={() => void saveSelection("yellow", annotation)}>
                          {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {saveError ? <p className="mt-2 text-xs text-red-600" role="alert">{saveError}</p> : null}
              </div>
            </Portal>
          ) : null}

          <DialogActions className="mx-auto max-w-3xl border-t border-zinc-950/10 pt-5">
            <Button type="button" outline onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </>
      ) : null}
    </Dialog>

    <Dialog open={!!annotationTarget} onClose={() => setAnnotationTarget(null)} size="sm" className="bg-[color-mix(in_oklab,var(--app-card)_94%,white)]! [--gutter:0.5rem]!">
      <HighlightAnnotationEditor
        value={annotationText}
        saving={updateAnnotation.isPending}
        error={annotationError}
        canRemove={!!annotationTarget?.payload.note}
        onChange={setAnnotationText}
        onCancel={() => {
          setAnnotationTarget(null);
          setAnnotationError(null);
        }}
        onSave={() => void saveExistingAnnotation()}
        onRemove={() => void saveExistingAnnotation("")}
      />
    </Dialog>

    <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} size="sm">
      <DialogTitle>Move this highlight to Trash?</DialogTitle>
      <DialogDescription>You can restore it during your plan’s recovery period. The saved article remains in Readspace.</DialogDescription>
      {deleteError ? <p className="mt-3 text-sm text-red-600" role="alert">{deleteError}</p> : null}
      <DialogActions>
        <Button type="button" plain disabled={deleteHighlight.isPending} onClick={() => setDeleteTarget(null)}>Cancel</Button>
        <Button type="button" color="red" disabled={deleteHighlight.isPending} onClick={() => void confirmDelete()}>{deleteHighlight.isPending ? "Moving…" : "Move to Trash"}</Button>
      </DialogActions>
    </Dialog>

    <ProUpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
  </>;
}
