import { useFolders } from "../hooks/useFoldersQuery";
import { useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  CalendarDays,
  ExternalLink,
  FolderCog,
  Trash2,
} from "lucide-react";
import { getEntryText } from "../lib/entryContent";
import { useUpdateEntryFolder } from "../hooks/useEntriesQuery";
import type { ReadspaceContent } from "../lib/readspaceContent";
import type { ReadspaceEntry } from "../types/bookmark";
import CollectionBadgeMenu from "./CollectionBadgeMenu";
import LibraryCard from "./LibraryCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function ReadspaceCard({
  entry,
  content,
  onOpen,
  onOrganize,
  onDelete,
  deletePermanently = false,
}: {
  entry: ReadspaceEntry;
  content: ReadspaceContent;
  onOpen: () => void;
  onOrganize: () => void;
  onDelete: () => void;
  deletePermanently?: boolean;
}) {
  const updateFolder = useUpdateEntryFolder();
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const { data: folders = [] } = useFolders();
  const currentFolder = folders.find((folder) => folder.id === entry.folder?.id) ?? entry.folder;
  const hasPreview = Boolean(getEntryText(content.html).trim());
  const published = content.publishedAt
    ? dateFormatter.format(new Date(content.publishedAt))
    : "";
  const updated = content.updatedAt
    ? dateFormatter.format(new Date(content.updatedAt))
    : "";
  const sourceDetails = [
    content.siteName,
    published ? `Published ${published}` : "",
    updated && updated !== published ? `Updated ${updated}` : "",
  ].filter(Boolean);

  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, textarea, [role='button']")
    ) {
      return;
    }
    onOpen();
  };

  return (
    <LibraryCard
      kind="read"
      collectionColor={currentFolder?.color}
      onClick={handleCardClick}
      raised={collectionMenuOpen}
      meta={
        <>
          <CalendarDays size={12} aria-hidden="true" />
          <span className="truncate">
            Saved {dateFormatter.format(new Date(entry.created_at))}
          </span>
        </>
      }
      title={
        <button
          type="button"
          onClick={onOpen}
          title={entry.title}
          className="block max-w-full truncate rounded-sm text-left decoration-[#0f766e] underline-offset-4 transition-colors hover:text-[#0f766e] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]/35"
        >
          {entry.title}
        </button>
      }
      details={
        <div className="flex h-full min-h-0 flex-col gap-1.5">
          {sourceDetails.length ? (
            <p className="truncate text-xs leading-5 text-[var(--app-muted)]">
              {sourceDetails.join(" · ")}
            </p>
          ) : null}
          {hasPreview ? (
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--app-card-strong)_48%,transparent)] px-2.5 py-1.5">
              <div
                inert
                className="entry-card-preview max-h-15 overflow-hidden text-xs leading-5 text-[var(--app-muted)] [&_em]:italic [&_h1]:my-0.5 [&_h1]:font-semibold [&_h2]:my-0.5 [&_h2]:font-semibold [&_h3]:my-0.5 [&_h3]:font-semibold [&_li]:my-0 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-0.5 [&_s]:line-through [&_strong]:font-semibold [&_u]:underline [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4"
                dangerouslySetInnerHTML={{ __html: content.html }}
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
        </div>
      }
      category={
        <CollectionBadgeMenu
          title={entry.title}
          folder={entry.folder}
          onMove={(folderId) =>
            updateFolder.mutateAsync({
              entryId: entry.id,
              kind: "read",
              folderId,
            })
          }
          movePending={updateFolder.isPending}
          onOpenChange={setCollectionMenuOpen}
        />
      }
      actions={
        <>
          <Button
            type="button"
            onClick={onOrganize}
            plain
            className="cursor-pointer rounded-full! p-0! text-[var(--app-muted)]! transition-colors hover:text-[var(--app-primary)]! data-hover:bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))]!"
            aria-label={`Organize ${entry.title}`}
          >
            <span className="flex size-10 items-center justify-center rounded-full">
              <FolderCog size={14} aria-hidden="true" />
            </span>
          </Button>
          <a
            href={content.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex size-10 items-center justify-center rounded-full text-[var(--app-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))] hover:text-[var(--app-primary)]"
            aria-label={`Open original ${entry.title}`}
          >
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <Button
            type="button"
            onClick={onDelete}
            plain
            className="cursor-pointer rounded-full! p-0! text-[var(--app-muted)]! transition-colors hover:text-red-500! data-hover:bg-red-50!"
            aria-label={deletePermanently ? `Delete ${entry.title} permanently` : `Move ${entry.title} to Trash`}
          >
            <span className="flex size-10 items-center justify-center rounded-full">
              <Trash2 size={14} aria-hidden="true" />
            </span>
          </Button>
        </>
      }
    />
  );
}
