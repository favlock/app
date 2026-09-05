import { useState, type SubmitEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useDeleteFolder, useUpdateFolder } from "../hooks/useFoldersQuery";
import {
  COLOR_NONE,
  getDisplayColor,
  PRESET_COLORS,
  type ColorConstant,
} from "../constants/colors";
import { Button } from "./ui/button";
import { Dropdown, DropdownButton, DropdownMenu } from "./ui/dropdown";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
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
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState(folder.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [failedColor, setFailedColor] = useState<ColorConstant | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);

  const selectedFolderColor = folder.color ?? COLOR_NONE;

  const handleChangeFolderColor = async (color: ColorConstant) => {
    setColorError(null);
    try {
      await updateFolder.mutateAsync({
        folderId: folder.id,
        updates: { color: color === COLOR_NONE ? null : color },
      });
      setFailedColor(null);
    } catch (error) {
      setFailedColor(color);
      setColorError(
        error instanceof Error ? error.message : "Could not change color.",
      );
    }
  };

  const openRenameDialog = () => {
    setFolderNameDraft(folder.name);
    setRenameError(null);
    setIsRenameDialogOpen(true);
  };

  const handleRenameFolder = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const nextName = folderNameDraft.trim();
    if (!nextName || nextName === folder.name) {
      setIsRenameDialogOpen(false);
      return;
    }

    setRenameError(null);
    try {
      await updateFolder.mutateAsync({
        folderId: folder.id,
        updates: { name: nextName },
      });
      onRenamed?.(folder.id, nextName);
      setIsRenameDialogOpen(false);
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : "Could not rename collection.",
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
      <Button
        plain
        onClick={openRenameDialog}
        className="theme-button-icon size-8! p-0! items-center"
        aria-label="Rename collection"
      >
        <Pencil className="size-3" />
      </Button>

      <Dropdown>
        <DropdownButton
          plain
          className="inline-flex size-5 rounded-full! p-0! items-center justify-center hover:bg-[color-mix(in_oklab,var(--app-card-strong)_72%,transparent)] cursor-pointer"
          aria-label="Change collection color"
        >
          <span
            className={`size-3.5 rounded-full block border border-gray-300 dark:border-[var(--app-line)]/20  ${
              selectedFolderColor === COLOR_NONE ? "bg-[var(--app-line)]" : ""
            }`}
            style={{
              backgroundColor:
                selectedFolderColor === COLOR_NONE
                  ? undefined
                  : getDisplayColor(folder.color),
            }}
          />
        </DropdownButton>
        <DropdownMenu anchor="bottom start">
          <div className="flex gap-1.5 flex-wrap p-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  void handleChangeFolderColor(color);
                }}
                className={`h-5 w-5 rounded-full border-2 transition-all cursor-pointer ${
                  selectedFolderColor === color
                    ? "scale-110 border-[var(--app-ink)]"
                    : "border-[color-mix(in_oklab,var(--app-line)_24%,transparent)] hover:border-[var(--app-primary)]"
                } ${color === COLOR_NONE ? "bg-[var(--app-line)]" : ""}`}
                style={{
                  backgroundColor:
                    color === COLOR_NONE ? undefined : getDisplayColor(color),
                }}
                title={color === COLOR_NONE ? "No color" : color}
                aria-label={
                  color === COLOR_NONE ? "No color" : `${color} color`
                }
                aria-pressed={selectedFolderColor === color}
              />
            ))}
          </div>
        </DropdownMenu>
      </Dropdown>

      <Button
        plain
        onClick={() => {
          setDeleteError(null);
          setIsDeleteDialogOpen(true);
        }}
        disabled={deleteFolder.isPending}
        className="inline-flex size-8! p-0! items-center justify-center rounded-lg text-red-500! dark:text-[var(--app-danger)]! hover:bg-red-50! hover:dark:bg-[var(--app-rose)]! hover:text-red-600! hover:dark:text-[var(--app-danger)]! cursor-pointer"
        aria-label="Delete collection"
      >
        <Trash2 className="size-4" />
      </Button>

      <Dialog
        open={isRenameDialogOpen}
        onClose={setIsRenameDialogOpen}
        size="sm"
      >
        <form onSubmit={handleRenameFolder}>
          <DialogTitle>Rename collection</DialogTitle>
          <DialogBody className="space-y-3">
            <Input
              type="text"
              aria-label="Collection name"
              value={folderNameDraft}
              onChange={(e) => setFolderNameDraft(e.target.value)}
              placeholder="Collection name"
              autoFocus
            />
            {renameError ? (
              <p className="text-sm text-red-500 " role="alert">
                {renameError}
              </p>
            ) : null}
          </DialogBody>
          <DialogActions>
            <Button
              type="button"
              outline
              onClick={() => setIsRenameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              color="emerald"
              disabled={updateFolder.isPending}
            >
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Delete collection"
        description={`Delete “${folder.name}”? Bookmarks in this collection will remain available in Unsorted.`}
        confirmLabel="Delete collection"
        busyLabel="Deleting..."
        busy={deleteFolder.isPending}
        error={deleteError}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteFolder()}
      />

      <Dialog
        open={!!colorError}
        onClose={() => setColorError(null)}
        size="sm"
      >
        <DialogTitle>Could not change collection color</DialogTitle>
        <DialogDescription>{colorError}</DialogDescription>
        <DialogActions>
          <Button type="button" outline onClick={() => setColorError(null)}>
            Dismiss
          </Button>
          <Button
            type="button"
            color="emerald"
            disabled={updateFolder.isPending || !failedColor}
            onClick={() => {
              if (failedColor) void handleChangeFolderColor(failedColor);
            }}
          >
            {updateFolder.isPending ? "Retrying..." : "Try again"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
