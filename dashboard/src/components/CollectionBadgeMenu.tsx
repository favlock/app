import { useEffect, useRef, useState } from "react";
import { FolderIcon } from "lucide-react";
import {
  getCollectionBadgeColor,
  getDisplayColor,
} from "../constants/colors";
import { useFolders } from "../hooks/useFoldersQuery";
import type { Folder } from "../types/bookmark";
import { BadgeButton } from "./ui/badge";
import { Button } from "./ui/button";

export default function CollectionBadgeMenu({
  title,
  folder,
  onMove,
  movePending,
  onOpenChange,
}: {
  title: string;
  folder?: Folder | null;
  onMove: (folderId: string | null) => Promise<unknown>;
  movePending: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { data: folders = [], isLoading } = useFolders();
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(folder?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLElement>(null);

  const setMenuOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    setFolderId(folder?.id ?? null);
  }, [folder?.id]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  });

  const currentFolder =
    folders.find((candidate) => candidate.id === folderId) ??
    (folder?.id === folderId ? folder : null);

  const moveToFolder = async (nextFolderId: string | null) => {
    if (nextFolderId === folderId) {
      setMenuOpen(false);
      return;
    }
    const previousFolderId = folderId;
    setFolderId(nextFolderId);
    setError(null);
    try {
      await onMove(nextFolderId);
      setMenuOpen(false);
    } catch (caughtError) {
      setFolderId(previousFolderId);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not change the collection.",
      );
    }
  };

  return (
    <div className="relative max-w-full" ref={containerRef}>
      <BadgeButton
        ref={buttonRef}
        type="button"
        onClick={() => {
          setError(null);
          const nextOpen = !open;
          setMenuOpen(nextOpen);
          if (nextOpen) {
            requestAnimationFrame(() => {
              containerRef.current
                ?.querySelector<HTMLElement>('[role="menuitemradio"]')
                ?.focus();
            });
          }
        }}
        aria-label={`Change collection for ${title}`}
        title={currentFolder?.name ?? "No collection"}
        aria-haspopup="menu"
        aria-expanded={open}
        color={getCollectionBadgeColor(currentFolder?.color)}
        className="max-w-full cursor-pointer transition-all hover:-translate-y-0.5 hover:opacity-90"
      >
        <FolderIcon size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">
          {currentFolder?.name ?? "No collection"}
        </span>
      </BadgeButton>

      {open ? (
        <div
          role="menu"
          aria-label={`Move ${title} to collection`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setMenuOpen(false);
              buttonRef.current?.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              return;
            }
            event.preventDefault();
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                '[role="menuitemradio"]',
              ),
            );
            const currentIndex = items.indexOf(
              document.activeElement as HTMLElement,
            );
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : event.key === "ArrowDown"
                    ? (currentIndex + 1) % items.length
                    : (currentIndex - 1 + items.length) % items.length;
            items[nextIndex]?.focus();
          }}
          className="absolute bottom-full left-0 z-50 mb-1.5 w-64 app-popup-surface app-collection-menu p-1"
        >
          <Button
            type="button"
            onClick={() => void moveToFolder(null)}
            disabled={movePending}
            plain
            role="menuitemradio"
            aria-checked={folderId === null}
            className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
              folderId === null
                ? "bg-[var(--app-mint)] font-medium text-[var(--app-primary)]"
                : "text-[var(--app-muted)] hover:bg-[var(--app-mint)]"
            }`}
          >
            No collection
          </Button>
          <div className="my-1 border-t border-[var(--app-ink)]/10" />
          {folders.map((candidate) => (
            <Button
              key={candidate.id}
              type="button"
              onClick={() => void moveToFolder(candidate.id)}
              disabled={movePending}
              plain
              role="menuitemradio"
              aria-checked={folderId === candidate.id}
              data-child={Boolean(candidate.parent_id)}
              className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                folderId === candidate.id
                  ? "bg-[var(--app-mint)] font-medium text-[var(--app-primary)]"
                  : "text-[var(--app-muted)] hover:bg-[var(--app-mint)]"
              }`}
            >
              <span
                className="size-2 flex-none rounded-full"
                style={{ backgroundColor: getDisplayColor(candidate.color) }}
                aria-hidden="true"
              />
              <span className="truncate" title={candidate.name}>
                {candidate.parent_id ? `↳ ${candidate.name}` : candidate.name}
              </span>
            </Button>
          ))}
          {isLoading ? (
            <p className="px-3 py-2 text-sm text-[var(--app-muted)]">
              Loading collections…
            </p>
          ) : folders.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--app-muted)]">
              No collections created
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mx-2 mt-1 rounded-lg bg-red-50 dark:bg-[var(--app-rose)] px-2 py-1.5 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
