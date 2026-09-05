import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link } from "react-router-dom";
import { useFolders } from "../hooks/useFoldersQuery";
import { useTags } from "../hooks/useTagsQuery";
import {
  useDeleteBookmark,
  useMoveBookmark,
  useToggleFavorite,
} from "../hooks/useBookmarksQuery";
import type { Bookmark } from "../types/bookmark";
import { FolderIcon, TrashIcon, Heart, Pencil } from "lucide-react";
import { Button } from "./ui/button";
import { Badge, BadgeButton } from "./ui/badge";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import AddBookmarkForm from "./AddBookmarkForm";
import { getCollectionBadgeColor } from "../constants/colors";
import { buildTagSlugIndex } from "../lib/collectionSlugs";
import { getMainDomain } from "../lib/domains";
import { getBookmarkShortcutModifier } from "../lib/bookmarkSearchShortcuts";
import LibraryCard from "./LibraryCard";
import { markFirstRetrieval } from "../lib/onboarding";
import { useAuth } from "../context/useAuth";
import { PLANS } from "@favlock/shared";

interface BookmarkCardProps {
  bookmark: Bookmark;
  onDeleted: () => void;
  onMoved?: () => void;
  searchShortcut?: number;
}

export default function BookmarkCard({
  bookmark,
  onDeleted,
  onMoved,
  searchShortcut,
}: BookmarkCardProps) {
  const { data: folders = [] } = useFolders();
  const { data: tags = [] } = useTags();
  const { isLocalAccount } = useAuth();
  const deleteBookmarkMutation = useDeleteBookmark();
  const moveBookmarkMutation = useMoveBookmark();
  const toggleFavoriteMutation = useToggleFavorite();
  const tagSlugIndex = useMemo(() => buildTagSlugIndex(tags), [tags]);

  const [deleting, setDeleting] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [favorite, setFavorite] = useState(Boolean(bookmark.is_favorite));
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const folderMenuButtonRef = useRef<HTMLElement>(null);
  const bookmarkLinkRef = useRef<HTMLAnchorElement>(null);
  const menuPointerActiveRef = useRef(false);

  const bookmarkFolder =
    bookmark.folders && bookmark.folders.length > 0
      ? bookmark.folders[0]
      : null;
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    bookmarkFolder?.id ?? null,
  );
  const currentFolder = currentFolderId
    ? (folders.find((folder) => folder.id === currentFolderId) ??
      (bookmarkFolder?.id === currentFolderId ? bookmarkFolder : null))
    : null;

  // Safari can report a null relatedTarget while tapping a menu item. Listen
  // for interactions that actually move outside instead of closing on blur.
  useEffect(() => {
    if (!showFolderMenu) return;

    let pointerResetTimeout: number | null = null;
    const isOutsideMenu = (event: Event) =>
      event.target instanceof Node &&
      menuRef.current &&
      !menuRef.current.contains(event.target);

    const handlePointerDown = (event: PointerEvent) => {
      if (pointerResetTimeout !== null) {
        window.clearTimeout(pointerResetTimeout);
      }

      menuPointerActiveRef.current = !isOutsideMenu(event);
      if (isOutsideMenu(event)) {
        setShowFolderMenu(false);
      }
    };

    const handlePointerEnd = () => {
      pointerResetTimeout = window.setTimeout(() => {
        menuPointerActiveRef.current = false;
      }, 0);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!menuPointerActiveRef.current && isOutsideMenu(event)) {
        setShowFolderMenu(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
      document.removeEventListener("focusin", handleFocusIn);
      if (pointerResetTimeout !== null) {
        window.clearTimeout(pointerResetTimeout);
      }
      menuPointerActiveRef.current = false;
    };
  }, [showFolderMenu]);

  useEffect(() => {
    setFaviconError(false);
  }, [bookmark.url]);

  useEffect(() => {
    setFavorite(Boolean(bookmark.is_favorite));
  }, [bookmark.id, bookmark.is_favorite]);

  useEffect(() => {
    setCurrentFolderId(bookmarkFolder?.id ?? null);
  }, [bookmark.id, bookmarkFolder?.id]);

  const moveToFolder = async (folderId: string | null) => {
    setMoveError(null);
    const previousFolderId = currentFolderId;
    setCurrentFolderId(folderId);

    try {
      await moveBookmarkMutation.mutateAsync({
        bookmarkId: bookmark.id,
        folderId,
      });
      setShowFolderMenu(false);
      onMoved?.();
    } catch (error) {
      setCurrentFolderId(previousFolderId);
      setMoveError(
        error instanceof Error
          ? error.message
          : "Could not move this bookmark. Try again.",
      );
    }
  };

  const confirmDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteBookmarkMutation.mutateAsync(bookmark.id);
      setShowDeleteDialog(false);
      onDeleted();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Could not delete this bookmark. Try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleFavorite = async () => {
    setFavoriteError(null);
    const nextValue = !favorite;
    setFavorite(nextValue);

    try {
      await toggleFavoriteMutation.mutateAsync({
        bookmarkId: bookmark.id,
        isFavorite: nextValue,
      });
      onMoved?.();
    } catch (error) {
      setFavorite(!nextValue);
      setFavoriteError(
        error instanceof Error
          ? error.message
          : "Could not update this favorite. Try again.",
      );
    }
  };

  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;

    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        'a, button, input, select, textarea, summary, [role="button"], [role="menuitem"], [role="menuitemradio"], [contenteditable="true"]',
      )
    ) {
      return;
    }

    bookmarkLinkRef.current?.click();
  };

  const hostname = (() => {
    try {
      return new URL(bookmark.url).hostname;
    } catch {
      return bookmark.url;
    }
  })();

  const initials = bookmark.title.trim().charAt(0).toUpperCase();
  const displayDomain = getMainDomain(bookmark.url);
  const faviconUrl = displayDomain
    ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(displayDomain)}.ico`
    : "";
  const shortcutModifier = getBookmarkShortcutModifier(
    typeof navigator === "undefined" ? "" : navigator.platform,
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  );

  return (
    <>
      <LibraryCard
        kind="bookmark"
        onClick={handleCardClick}
        raised={showFolderMenu}
        meta={
          searchShortcut ? (
            <kbd
              className="inline-flex items-center gap-0.5 font-sans text-[11px] font-semibold tabular-nums"
              title={`Open with ${shortcutModifier.label} + ${searchShortcut}`}
              aria-label={`Open with ${shortcutModifier.label} + ${searchShortcut}`}
            >
              <span aria-hidden="true">{shortcutModifier.display}</span>
              <span aria-hidden="true">{searchShortcut}</span>
            </kbd>
          ) : undefined
        }
        title={
          <a
            ref={bookmarkLinkRef}
            href={bookmark.url}
            onClick={() => markFirstRetrieval(bookmark.user_id)}
            target="_blank"
            rel="noopener noreferrer"
            title={bookmark.title}
            className="relative block max-w-full truncate rounded-sm decoration-[#0f766e] underline-offset-4 transition-colors hover:text-[#0f766e] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]/35"
          >
            {bookmark.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        }
        details={
          <div className="flex h-full min-h-0 flex-col justify-center gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-[color-mix(in_oklab,var(--app-card-strong)_48%,transparent)] px-2.5 py-2 text-[var(--app-muted)]">
              {faviconUrl && !faviconError ? (
                <img
                  src={faviconUrl}
                  alt=""
                  onError={() => setFaviconError(true)}
                  className="size-5 flex-none rounded-md"
                />
              ) : (
                <span
                  data-testid="bookmark-favicon-fallback"
                  className="flex size-5 flex-none items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--app-line)_12%,var(--app-card))] text-[11px] font-bold text-[var(--app-muted)]"
                >
                  {initials}
                </span>
              )}
              <span
                className="min-w-0 truncate text-sm font-medium leading-5"
                title={hostname}
              >
                {displayDomain}
              </span>
            </div>

            {bookmark.tags?.length ? (
              <div className="flex flex-wrap gap-1" aria-label="Tags">
                {bookmark.tags.map((tag) => {
                  const tagSlug = tagSlugIndex.slugById.get(tag.id);
                  const tagBadge = (
                    <Badge
                      color="violet"
                      className="max-w-full bg-violet-500/8! px-1.5! py-0! text-[11px]/4! font-medium! text-violet-600!"
                    >
                      <span className="truncate" title={`#${tag.name}`}>
                        #{tag.name}
                      </span>
                    </Badge>
                  );

                  return tagSlug ? (
                    <Link
                      key={tag.id}
                      to={`/t/${tagSlug}`}
                      className="min-w-0 max-w-full rounded-md transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30"
                    >
                      {tagBadge}
                    </Link>
                  ) : (
                    <span key={tag.id} className="min-w-0 max-w-full">
                      {tagBadge}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
        }
        category={
          <div className="relative" ref={menuRef}>
              <BadgeButton
                ref={folderMenuButtonRef}
                onClick={() => {
                  setMoveError(null);
                  const willOpen = !showFolderMenu;
                  setShowFolderMenu(willOpen);
                  if (willOpen) {
                    requestAnimationFrame(() => {
                      document
                        .querySelector<HTMLElement>(
                          `#folder-menu-${bookmark.id} [role="menuitemradio"]`,
                        )
                        ?.focus();
                    });
                  }
                }}
                aria-haspopup="menu"
                aria-expanded={showFolderMenu}
                aria-controls={`folder-menu-${bookmark.id}`}
                color={
                  currentFolder
                    ? getCollectionBadgeColor(currentFolder.color)
                    : "zinc"
                }
                className="max-w-full cursor-pointer text-sm transition-opacity hover:opacity-85"
                title={currentFolder ? currentFolder.name : "No collection"}
              >
                <FolderIcon size={12} className="shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {currentFolder ? currentFolder.name : "No collection"}
                </span>
              </BadgeButton>

              {showFolderMenu && (
                <div
                  id={`folder-menu-${bookmark.id}`}
                  role="menu"
                  aria-label={`Move ${bookmark.title} to collection`}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setShowFolderMenu(false);
                      folderMenuButtonRef.current?.focus();
                      return;
                    }

                    if (
                      !["ArrowDown", "ArrowUp", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
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
                  className="absolute left-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-[#1d2230]/20 bg-[#fff8e9] py-1.5 shadow-[0_8px_18px_-12px_rgba(29,34,48,0.42)]"
                >
                  <Button
                    onClick={() => moveToFolder(null)}
                    disabled={moveBookmarkMutation.isPending}
                    plain
                    role="menuitemradio"
                    aria-checked={currentFolderId === null}
                    className={`w-full px-3 py-1.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      currentFolderId === null
                        ? "bg-[#ffefcb] font-medium text-[#0f766e]  "
                        : "text-[#4f5566] hover:bg-[#ffefcb]/70  "
                    }`}
                  >
                    No collection
                  </Button>
                  <div className="my-1 border-t border-[#1d2230]/10 " />
                  {folders.map((folder) => (
                    <Button
                      key={folder.id}
                      onClick={() => moveToFolder(folder.id)}
                      disabled={moveBookmarkMutation.isPending}
                      plain
                      role="menuitemradio"
                      aria-checked={currentFolderId === folder.id}
                      className={`w-full px-3 py-1.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        currentFolderId === folder.id
                          ? "bg-[#ffefcb] font-medium text-[#0f766e]  "
                          : "text-[#4f5566] hover:bg-[#ffefcb]/70  "
                      }`}
                    >
                      <span className="truncate" title={folder.name}>
                        {folder.parent_id ? `↳ ${folder.name}` : folder.name}
                      </span>
                    </Button>
                  ))}
                  {folders.length === 0 && (
                    <p className="px-4 py-2 text-sm text-gray-400 ">
                      No collections created
                    </p>
                  )}
                  {moveError && (
                    <p
                      role="alert"
                      className="mx-2 mt-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700"
                    >
                      {moveError}
                    </p>
                  )}
                </div>
              )}
          </div>
        }
        actions={
          <>
              <Button
                onClick={handleToggleFavorite}
                plain
                className="cursor-pointer rounded-full! p-0! text-[var(--app-muted)]! transition-colors hover:text-red-500! data-hover:bg-red-50! data-active:bg-red-100!"
                title={favorite ? "Remove from favorites" : "Add to favorites"}
                aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={favorite}
              >
                <span className="flex size-10 items-center justify-center rounded-full">
                  <Heart
                    size={15}
                    aria-hidden="true"
                    className={favorite ? "fill-red-500 text-red-500" : "text-current"}
                  />
                </span>
              </Button>
              <Button
                onClick={() => setShowEditDialog(true)}
                plain
                className="cursor-pointer rounded-full! p-0! text-[var(--app-muted)]! transition-colors hover:text-[var(--app-primary)]! data-hover:bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))]!"
                title="Edit bookmark"
                aria-label="Edit bookmark"
              >
                <span className="flex size-10 items-center justify-center rounded-full">
                  <Pencil size={14} aria-hidden="true" />
                </span>
              </Button>
              <Button
                onClick={() => {
                  setDeleteError(null);
                  setShowDeleteDialog(true);
                }}
                disabled={deleting}
                plain
                className="cursor-pointer rounded-full! p-0! text-[var(--app-muted)]! transition-colors hover:text-red-500! data-hover:bg-red-50!"
                title={isLocalAccount ? "Delete permanently" : "Move to Trash"}
                aria-label={isLocalAccount ? "Delete bookmark permanently" : "Move bookmark to Trash"}
              >
                <span className="flex size-10 items-center justify-center rounded-full">
                  <TrashIcon size={14} aria-hidden="true" />
                </span>
              </Button>
          </>
        }
      />

      {favoriteError ? (
        <div
          className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700"
          role="alert"
        >
          <span>{favoriteError}</span>
          <button
            type="button"
            className="shrink-0 font-semibold underline underline-offset-2"
            onClick={() => setFavoriteError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={deleting ? () => {} : setShowDeleteDialog}
      >
        <DialogTitle>
          {isLocalAccount ? "Delete bookmark permanently?" : "Move bookmark to Trash?"}
        </DialogTitle>
        <DialogDescription>
          {isLocalAccount
            ? `This bookmark will be immediately deleted from this device and cannot be restored. A free cloud account keeps deleted items in Trash for ${PLANS.free.trashRecoveryDays} days.`
            : "You can restore this bookmark from Trash before its recovery period expires."}
        </DialogDescription>
        {deleteError ? (
          <p
            className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600"
            role="alert"
          >
            {deleteError}
          </p>
        ) : null}
        <DialogActions>
          <Button
            plain
            onClick={() => setShowDeleteDialog(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button onClick={confirmDelete} disabled={deleting} color="red">
            {deleting
              ? (isLocalAccount ? "Deleting..." : "Moving...")
              : (isLocalAccount ? "Delete permanently" : "Move to Trash")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <AddBookmarkForm
        editBookmark={bookmark}
        open={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        onAdded={() => {
          setShowEditDialog(false);
          onMoved?.();
        }}
      />
    </>
  );
}
