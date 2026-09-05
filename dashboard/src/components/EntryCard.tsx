import { useFolders } from "../hooks/useFoldersQuery";
import { useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  CheckCircle2,
  Circle,
  Clock3,
  Pencil,
  Trash2,
} from "lucide-react";
import { getEntryText, sanitizeEntryHtml } from "../lib/entryContent";
import type { Entry } from "../types/bookmark";
import CollectionBadgeMenu from "./CollectionBadgeMenu";
import LibraryCard from "./LibraryCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

interface EntryCardProps<TEntry extends Entry> {
  kind: "note" | "todo";
  entry: TEntry;
  completed?: boolean;
  onEdit: (entry: TEntry) => void;
  onDelete: () => Promise<unknown>;
  deletePending: boolean;
  onMove: (folderId: string | null) => Promise<unknown>;
  movePending: boolean;
  onToggle?: (completed: boolean) => Promise<unknown>;
  togglePending?: boolean;
  deletePermanently?: boolean;
}

const entryDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function EntryCard<TEntry extends Entry>({
  kind,
  entry,
  completed = false,
  onEdit,
  onDelete,
  deletePending,
  onMove,
  movePending,
  onToggle,
  togglePending = false,
  deletePermanently = false,
}: EntryCardProps<TEntry>) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const { data: folders = [] } = useFolders();
  const currentFolder = folders.find((folder) => folder.id === entry.folder?.id) ?? entry.folder;
  const isTodo = kind === "todo";
  const singular = isTodo ? "task" : "document";
  const previewHtml = sanitizeEntryHtml(entry.content);
  const hasPreview = Boolean(getEntryText(previewHtml).trim());

  const toggle = async () => {
    if (!onToggle) return;
    setToggleError(null);
    try {
      await onToggle(!completed);
    } catch (error) {
      setToggleError(
        error instanceof Error ? error.message : `Could not update this ${singular}.`,
      );
    }
  };

  const confirmDelete = async () => {
    setDeleteError(null);
    try {
      await onDelete();
      setShowDeleteDialog(false);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : `Could not delete this ${singular}.`,
      );
    }
  };

  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, textarea, [role='button']")
    ) {
      return;
    }
    onEdit(entry);
  };

  return (
    <>
      <LibraryCard
        kind={kind}
        collectionColor={currentFolder?.color}
        onClick={handleCardClick}
        raised={collectionMenuOpen}
        meta={
          !isTodo ? (
            <>
              <Clock3 size={12} aria-hidden="true" />
              <span className="truncate">
                Created {entryDateFormatter.format(new Date(entry.created_at))}
              </span>
            </>
          ) : undefined
        }
        title={
          <button
            type="button"
            onClick={() => onEdit(entry)}
            title={entry.title}
            className={`block max-w-full truncate rounded-sm text-left decoration-[#0f766e] underline-offset-4 transition-colors hover:text-[#0f766e] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]/35 ${
              completed ? "line-through opacity-60" : ""
            }`}
          >
            {entry.title}
          </button>
        }
        details={
          <div className="flex h-full min-h-0 flex-col gap-1.5">
            {hasPreview ? (
              <div className="rounded-lg bg-[color-mix(in_oklab,var(--app-card-strong)_48%,transparent)] px-2.5 py-1.5">
                <div
                  inert
                  className={`entry-card-preview max-h-15 overflow-hidden text-xs leading-5 text-[var(--app-muted)] [&_blockquote]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--app-accent)] [&_blockquote]:pl-2 [&_em]:italic [&_li]:my-0 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-0.5 [&_s]:line-through [&_strong]:font-semibold [&_u]:underline [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 ${
                    completed ? "opacity-60" : ""
                  }`}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            ) : null}
            {entry.tags?.length ? (
              <div className="flex flex-wrap gap-1" aria-label="Tags">
                {entry.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    color="violet"
                    className="max-w-full bg-violet-500/8! px-1.5! py-0! text-[11px]/4! font-medium! text-violet-600!"
                  >
                    <span className="truncate" title={`#${tag.name}`}>
                      #{tag.name}
                    </span>
                  </Badge>
                ))}
              </div>
            ) : null}
            {toggleError ? (
              <p className="text-xs text-red-600" role="alert">
                {toggleError}
              </p>
            ) : null}
          </div>
        }
        category={
          <CollectionBadgeMenu
            title={entry.title}
            folder={entry.folder}
            onMove={onMove}
            movePending={movePending}
            onOpenChange={setCollectionMenuOpen}
          />
        }
        actions={
          <>
            <Button
              type="button"
              onClick={() => onEdit(entry)}
              plain
              className="cursor-pointer rounded-full! p-0! text-[var(--app-muted)]! transition-colors hover:text-[var(--app-primary)]! data-hover:bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))]!"
              aria-label={`Edit ${entry.title}`}
            >
              <span className="flex size-10 items-center justify-center rounded-full">
                <Pencil size={14} aria-hidden="true" />
              </span>
            </Button>
            <Button
              type="button"
              onClick={() => setShowDeleteDialog(true)}
              plain
              className="cursor-pointer rounded-full! p-0! text-[var(--app-muted)]! transition-colors hover:text-red-500! data-hover:bg-red-50!"
              aria-label={deletePermanently ? `Delete ${entry.title} permanently` : `Move ${entry.title} to Trash`}
            >
              <span className="flex size-10 items-center justify-center rounded-full">
                <Trash2 size={14} aria-hidden="true" />
              </span>
            </Button>
            {onToggle ? (
              <button
                type="button"
                onClick={() => void toggle()}
                disabled={togglePending}
                className="flex size-10 items-center justify-center rounded-full text-[var(--app-primary)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))] disabled:opacity-50"
                aria-label={
                  completed
                    ? `Mark ${entry.title} as open`
                    : `Mark ${entry.title} complete`
                }
              >
                {completed ? (
                  <CheckCircle2 size={18} aria-hidden="true" />
                ) : (
                  <Circle size={18} aria-hidden="true" />
                )}
              </button>
            ) : null}
          </>
        }
      />

      <Dialog
        open={showDeleteDialog}
        onClose={deletePending ? () => {} : () => setShowDeleteDialog(false)}
        size="sm"
      >
        <DialogTitle>{deletePermanently ? `Delete ${singular} permanently?` : `Move ${singular} to Trash?`}</DialogTitle>
        <DialogDescription>
          {deletePermanently
            ? `“${entry.title}” will be deleted immediately. A free cloud account includes 7 days of Trash retention.`
            : `“${entry.title}” can be restored from Trash before its recovery period expires.`}
        </DialogDescription>
        {deleteError ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {deleteError}
          </p>
        ) : null}
        <DialogActions>
          <Button
            type="button"
            plain
            onClick={() => setShowDeleteDialog(false)}
            disabled={deletePending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            color="red"
            onClick={() => void confirmDelete()}
            disabled={deletePending}
          >
            {deletePending ? "Deleting..." : deletePermanently ? "Delete permanently" : "Move to Trash"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
