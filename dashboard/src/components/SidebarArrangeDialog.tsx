import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  ArrowUpToLine,
  ChevronRight,
  CornerDownRight,
  CornerLeftUp,
  Ellipsis,
  Tag as TagIcon,
} from "lucide-react";
import { COLOR_NONE, getColorHex } from "../constants/colors";
import { useReorderFolders } from "../hooks/useFoldersQuery";
import { useReorderTags } from "../hooks/useTagsQuery";
import {
  buildFolderPlacements,
  folderSiblings,
  nestTargets,
  placeFolder,
  sortFolders,
} from "../lib/folderOrder";
import {
  buildTagPlacements,
  placeTag,
  sortTagsByCustomOrder,
} from "../lib/sidebarSort";
import type { Folder, Tag } from "../types/bookmark";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "./ui/dropdown";

type FocusTarget = { id: string; control: "up" | "down" | "menu" };

const iconButtonClass =
  "theme-button-icon inline-flex size-11 shrink-0 items-center justify-center p-0! disabled:pointer-events-none disabled:opacity-30 sm:size-9";

function sameOrder<T extends { id: string }>(left: T[], right: T[]) {
  return left.length === right.length && left.every((item, i) => item.id === right[i]?.id);
}

function useRowFocus() {
  const listRef = useRef<HTMLUListElement>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-arrange-id="${CSS.escape(focusTarget.id)}"]`,
    );
    const preferred = row?.querySelector<HTMLButtonElement>(
      `[data-arrange-control="${focusTarget.control}"]`,
    );
    const fallback = row?.querySelector<HTMLButtonElement>(
      "[data-arrange-control]:not(:disabled)",
    );
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  return { listRef, setFocusTarget };
}

interface ArrangeRowProps {
  id: string;
  name: string;
  icon: ReactNode;
  nested?: boolean;
  position: number;
  total: number;
  onMove: (index: number, control: FocusTarget["control"]) => void;
  extraMenuItems?: ReactNode;
}

function ArrangeRow({
  id,
  name,
  icon,
  nested = false,
  position,
  total,
  onMove,
  extraMenuItems,
}: ArrangeRowProps) {
  const isFirst = position === 0;
  const isLast = position === total - 1;

  return (
    <li
      data-arrange-id={id}
      className={`flex min-h-12 items-center gap-1 rounded-xl px-1 hover:bg-[color-mix(in_oklab,var(--app-line)_5%,transparent)] ${
        nested ? "ml-5" : ""
      }`}
    >
      {nested && (
        <CornerDownRight
          className="size-3.5 flex-none text-[var(--app-muted)]"
          aria-hidden="true"
        />
      )}
      <span className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm text-[var(--app-ink)]">
        {icon}
        <span className="truncate">{name}</span>
      </span>
      <button
        type="button"
        data-arrange-control="up"
        className={iconButtonClass}
        aria-label={`Move ${name} up`}
        disabled={isFirst}
        onClick={() => onMove(position - 1, "up")}
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-arrange-control="down"
        className={iconButtonClass}
        aria-label={`Move ${name} down`}
        disabled={isLast}
        onClick={() => onMove(position + 1, "down")}
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </button>
      <Dropdown>
        <DropdownButton
          plain
          data-arrange-control="menu"
          className={iconButtonClass}
          aria-label={`More ways to move ${name}`}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </DropdownButton>
        <DropdownMenu anchor="bottom end" className="min-w-52">
          <DropdownItem disabled={isFirst} onClick={() => onMove(0, "menu")}>
            <ArrowUpToLine data-slot="icon" aria-hidden="true" />
            <DropdownLabel>Move to top</DropdownLabel>
          </DropdownItem>
          <DropdownItem
            disabled={isLast}
            onClick={() => onMove(total - 1, "menu")}
          >
            <ArrowDownToLine data-slot="icon" aria-hidden="true" />
            <DropdownLabel>Move to bottom</DropdownLabel>
          </DropdownItem>
          {extraMenuItems && (
            <>
              <DropdownDivider />
              {extraMenuItems}
            </>
          )}
        </DropdownMenu>
      </Dropdown>
    </li>
  );
}

interface ArrangeDialogFrameProps {
  open: boolean;
  title: string;
  description: string;
  changed: boolean;
  saving: boolean;
  error: string | null;
  announcement: string;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
}

function ArrangeDialogFrame({
  open,
  title,
  description,
  changed,
  saving,
  error,
  announcement,
  onClose,
  onSave,
  children,
}: ArrangeDialogFrameProps) {
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <DialogBody className="-mx-2 max-h-[min(60dvh,32rem)] overflow-y-auto px-1">
        {children}
      </DialogBody>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {error && (
        <p className="mt-4 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button color="emerald" disabled={!changed || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save order"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface ArrangeCollectionsDialogProps {
  open: boolean;
  folders: Folder[];
  onClose: () => void;
  onSaved: () => void;
}

export function ArrangeCollectionsDialog({
  open,
  folders,
  onClose,
  onSaved,
}: ArrangeCollectionsDialogProps) {
  const reorderFolders = useReorderFolders();
  const [draft, setDraft] = useState(() => sortFolders(folders));
  const [nestingId, setNestingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { listRef, setFocusTarget } = useRowFocus();
  const original = sortFolders(folders);
  const changed =
    !sameOrder(draft, original) ||
    draft.some(
      (folder, i) => folder.parent_id !== original[i]?.parent_id,
    );
  const nestingFolder = draft.find(({ id }) => id === nestingId);

  const announce = (folderId: string, nextDraft: Folder[]) => {
    const folder = nextDraft.find(({ id }) => id === folderId);
    if (!folder) return;
    const siblings = folderSiblings(nextDraft, folderId);
    const parent = nextDraft.find(({ id }) => id === folder.parent_id);
    setAnnouncement(
      `${folder.name} is ${siblings.indexOf(folder) + 1} of ${siblings.length}${
        parent ? ` in ${parent.name}` : ""
      }.`,
    );
  };

  const move = (
    folderId: string,
    parentId: string | null,
    index: number,
    control: FocusTarget["control"],
  ) => {
    const nextDraft = placeFolder(draft, folderId, parentId, index);
    setDraft(nextDraft);
    setError(null);
    announce(folderId, nextDraft);
    setFocusTarget({ id: folderId, control });
  };

  const save = async () => {
    setError(null);
    try {
      await reorderFolders.mutateAsync(buildFolderPlacements(draft));
      onSaved();
    } catch {
      setError("Could not save the collection order. Try again.");
    }
  };

  return (
    <ArrangeDialogFrame
      open={open}
      title={nestingFolder ? `Move “${nestingFolder.name}”` : "Arrange collections"}
      description={
        nestingFolder
          ? "Choose the collection it should belong to."
          : "Use the arrows to reorder. Open ⋯ to jump to the top or bottom, or to change where a collection belongs."
      }
      changed={changed}
      saving={reorderFolders.isPending}
      error={error}
      announcement={announcement}
      onClose={onClose}
      onSave={() => void save()}
    >
      {nestingFolder ? (
        <div>
          <button
            type="button"
            className="mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[var(--app-primary)] focus-visible:outline-2 focus-visible:outline-[var(--app-primary)]"
            onClick={() => {
              setNestingId(null);
              setFocusTarget({ id: nestingFolder.id, control: "menu" });
            }}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to all collections
          </button>
          <ul className="space-y-1">
            {nestTargets(draft, nestingFolder.id).map((target) => (
              <li key={target.id}>
                <button
                  type="button"
                  className="theme-nav-button flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-sm"
                  onClick={() => {
                    setNestingId(null);
                    move(
                      nestingFolder.id,
                      target.id,
                      Number.MAX_SAFE_INTEGER,
                      "menu",
                    );
                  }}
                >
                  <FolderDot folder={target} />
                  <span className="min-w-0 flex-1 truncate">{target.name}</span>
                  <ChevronRight
                    className="size-4 text-[var(--app-muted)]"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul ref={listRef} className="space-y-0.5">
          {draft.map((folder) => {
            const siblings = folderSiblings(draft, folder.id);
            const nested = draft.some(
              (parent) => parent.id === folder.parent_id && parent.parent_id === null,
            );
            const canNest = nestTargets(draft, folder.id).length > 0;
            return (
              <ArrangeRow
                key={folder.id}
                id={folder.id}
                name={folder.name}
                icon={<FolderDot folder={folder} />}
                nested={nested}
                position={siblings.indexOf(folder)}
                total={siblings.length}
                onMove={(index, control) =>
                  move(folder.id, folder.parent_id, index, control)
                }
                extraMenuItems={
                  canNest || nested ? (
                    <>
                      {canNest && (
                        <DropdownItem onClick={() => setNestingId(folder.id)}>
                          <CornerDownRight data-slot="icon" aria-hidden="true" />
                          <DropdownLabel>
                            {nested ? "Move to another collection…" : "Move into a collection…"}
                          </DropdownLabel>
                        </DropdownItem>
                      )}
                      {nested && (
                        <DropdownItem
                          onClick={() =>
                            move(
                              folder.id,
                              null,
                              Number.MAX_SAFE_INTEGER,
                              "menu",
                            )
                          }
                        >
                          <CornerLeftUp data-slot="icon" aria-hidden="true" />
                          <DropdownLabel>Move to top level</DropdownLabel>
                        </DropdownItem>
                      )}
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </ul>
      )}
    </ArrangeDialogFrame>
  );
}

function FolderDot({ folder }: { folder: Folder }) {
  const colored = folder.color && folder.color !== COLOR_NONE;
  return (
    <span
      className={`h-3 w-3 flex-none rounded-full ring-1 ring-inset ring-black/10 ${
        colored ? "saturate-175 brightness-95" : "bg-[var(--app-line)]"
      }`}
      style={{ backgroundColor: colored ? getColorHex(folder.color!) : undefined }}
      aria-hidden="true"
    />
  );
}

interface ArrangeTagsDialogProps {
  open: boolean;
  tags: Tag[];
  onClose: () => void;
  onSaved: () => void;
}

export function ArrangeTagsDialog({
  open,
  tags,
  onClose,
  onSaved,
}: ArrangeTagsDialogProps) {
  const reorderTags = useReorderTags();
  const [draft, setDraft] = useState(() => sortTagsByCustomOrder(tags));
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { listRef, setFocusTarget } = useRowFocus();
  const original = sortTagsByCustomOrder(tags);
  const changed = !sameOrder(draft, original);

  const move = (tagId: string, index: number, control: FocusTarget["control"]) => {
    const nextDraft = placeTag(draft, tagId, index);
    const position = nextDraft.findIndex(({ id }) => id === tagId);
    setDraft(nextDraft);
    setError(null);
    setAnnouncement(
      `${nextDraft[position]?.name} is ${position + 1} of ${nextDraft.length}.`,
    );
    setFocusTarget({ id: tagId, control });
  };

  const save = async () => {
    setError(null);
    try {
      await reorderTags.mutateAsync(buildTagPlacements(draft));
      onSaved();
    } catch {
      setError("Could not save the tag order. Try again.");
    }
  };

  return (
    <ArrangeDialogFrame
      open={open}
      title="Arrange tags"
      description="Use the arrows to reorder. Open ⋯ to jump to the top or bottom."
      changed={changed}
      saving={reorderTags.isPending}
      error={error}
      announcement={announcement}
      onClose={onClose}
      onSave={() => void save()}
    >
      <ul ref={listRef} className="space-y-0.5">
        {draft.map((tag, position) => (
          <ArrangeRow
            key={tag.id}
            id={tag.id}
            name={tag.name}
            icon={
              <TagIcon
                className="size-3.5 flex-none text-[var(--app-muted)]"
                aria-hidden="true"
              />
            }
            position={position}
            total={draft.length}
            onMove={(index, control) => move(tag.id, index, control)}
          />
        ))}
      </ul>
    </ArrangeDialogFrame>
  );
}
