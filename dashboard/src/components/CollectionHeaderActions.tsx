import { useState, type SubmitEvent } from "react";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useDeleteFolder, useUpdateFolder } from "../hooks/useFoldersQuery";
import {
  COLOR_NONE,
  getColorHex,
  PRESET_COLORS,
  type ColorConstant,
} from "../constants/colors";
import { Button } from "./ui/button";
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from "./ui/dropdown";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import type { Folder } from "../types/bookmark";
import ConfirmDialog from "./ConfirmDialog";

interface CollectionHeaderActionsProps {
  folder: Folder;
  onDeleted: () => void;
  onRenamed?: (folderId: string, nextName: string) => void;
}

export default function CollectionHeaderActions({
  folder,
  onDeleted,
  onRenamed,
}: CollectionHeaderActionsProps) {
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState(folder.name);
  const [folderColorDraft, setFolderColorDraft] = useState<ColorConstant>(
    folder.color ?? COLOR_NONE,
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openEditDialog = () => {
    setFolderNameDraft(folder.name);
    setFolderColorDraft(folder.color ?? COLOR_NONE);
    setEditError(null);
    setIsEditDialogOpen(true);
  };

  const handleEditFolder = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const nextName = folderNameDraft.trim();
    if (!nextName) return;
    const nameChanged = nextName !== folder.name;
    const colorChanged = folderColorDraft !== (folder.color ?? COLOR_NONE);
    if (!nameChanged && !colorChanged) {
      setIsEditDialogOpen(false);
      return;
    }

    setEditError(null);
    try {
      await updateFolder.mutateAsync({
        folderId: folder.id,
        updates: {
          ...(nameChanged ? { name: nextName } : {}),
          ...(colorChanged
            ? { color: folderColorDraft === COLOR_NONE ? null : folderColorDraft }
            : {}),
        },
      });
      if (nameChanged) onRenamed?.(folder.id, nextName);
      setIsEditDialogOpen(false);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Could not update collection.",
      );
    }
  };

  const handleDeleteFolder = async () => {
    setDeleteError(null);
    try {
      await deleteFolder.mutateAsync(folder.id);
      setIsDeleteDialogOpen(false);
      onDeleted();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Could not delete collection.",
      );
    }
  };

  return (
    <>
      <Dropdown>
        <DropdownButton plain
          className="theme-button-icon size-9! shrink-0 items-center justify-center p-0!"
          aria-label="Collection actions" title="Collection actions">
          <Ellipsis className="size-5" aria-hidden="true" />
        </DropdownButton>
        <DropdownMenu anchor="bottom start" className="min-w-52">
          <DropdownItem onClick={openEditDialog}>
            <Pencil data-slot="icon" aria-hidden="true" />
            <DropdownLabel>Edit collection</DropdownLabel>
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem
            disabled={deleteFolder.isPending}
            onClick={() => {
              setDeleteError(null);
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash2 data-slot="icon" aria-hidden="true" />
            <DropdownLabel>Remove collection</DropdownLabel>
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Dialog
        open={isEditDialogOpen}
        onClose={setIsEditDialogOpen}
        size="lg"
      >
        <DialogTitle>Edit Collection</DialogTitle>
        <DialogDescription>Change this collection’s name or color.</DialogDescription>
        <form onSubmit={handleEditFolder} className="mt-5 space-y-5">
          <label className="block text-sm font-medium text-[var(--app-ink)]">
            Name
            <input
              autoFocus
              required
              value={folderNameDraft}
              onChange={(e) => setFolderNameDraft(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--app-line)] bg-[var(--app-card)] px-3 text-[var(--app-ink)] focus:outline-2 focus:outline-[var(--app-primary)]"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-[var(--app-ink)]">Color</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color === COLOR_NONE ? "No color" : `${color.toLowerCase()} color`}
                  aria-pressed={folderColorDraft === color}
                  title={color === COLOR_NONE ? "No color" : `${color.toLowerCase()} color`}
                  onClick={() => setFolderColorDraft(color)}
                  className={`size-9 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] ${folderColorDraft === color ? "border-[var(--app-ink)]" : "border-transparent"}`}
                >
                  <span
                    className="block size-full rounded-full border border-[var(--app-line)]"
                    style={{ background: getColorHex(color) }}
                  />
                </button>
              ))}
            </div>
          </fieldset>
          {editError ? <p className="text-sm text-red-600" role="alert">{editError}</p> : null}
          <DialogActions>
            <Button
              type="button"
              outline
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!folderNameDraft.trim() || updateFolder.isPending}
            >
              {updateFolder.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Remove collection"
        description={`Remove “${folder.name}”? Bookmarks in this collection will remain available in Unsorted.`}
        confirmLabel="Remove collection"
        busyLabel="Removing..."
        busy={deleteFolder.isPending}
        error={deleteError}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteFolder()}
      />
    </>
  );
}
