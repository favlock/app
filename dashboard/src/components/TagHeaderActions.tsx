import { useState, type SubmitEvent } from "react";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useDeleteTag, useUpdateTag } from "../hooks/useTagsQuery";
import { Button } from "./ui/button";
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from "./ui/dropdown";
import { Dialog, DialogActions, DialogDescription, DialogTitle } from "./ui/dialog";
import type { Tag } from "../types/bookmark";
import ConfirmDialog from "./ConfirmDialog";

interface TagHeaderActionsProps {
  tag: Tag;
  onDeleted: () => void;
  onRenamed?: (tagId: string, nextName: string) => void;
}

export default function TagHeaderActions({
  tag,
  onDeleted,
  onRenamed,
}: TagHeaderActionsProps) {
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [tagNameDraft, setTagNameDraft] = useState(tag.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openRenameDialog = () => {
    setTagNameDraft(tag.name);
    setRenameError(null);
    setIsRenameDialogOpen(true);
  };

  const handleRenameTag = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const nextName = tagNameDraft.trim();
    if (!nextName || nextName === tag.name) {
      setIsRenameDialogOpen(false);
      return;
    }

    setRenameError(null);
    try {
      await updateTag.mutateAsync({ tagId: tag.id, name: nextName });
      onRenamed?.(tag.id, nextName);
      setIsRenameDialogOpen(false);
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : "Could not rename tag.",
      );
    }
  };

  const handleDeleteTag = async () => {
    setDeleteError(null);
    try {
      await deleteTag.mutateAsync(tag.id);
      setIsDeleteDialogOpen(false);
      onDeleted();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete tag.",
      );
    }
  };

  return (
    <>
      <Dropdown>
        <DropdownButton plain
          className="theme-button-icon size-9! shrink-0 items-center justify-center p-0!"
          aria-label="Tag actions" title="Tag actions">
          <Ellipsis className="size-5" aria-hidden="true" />
        </DropdownButton>
        <DropdownMenu anchor="bottom start" className="min-w-52">
          <DropdownItem onClick={openRenameDialog}>
            <Pencil data-slot="icon" aria-hidden="true" />
            <DropdownLabel>Edit tag</DropdownLabel>
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem
            disabled={deleteTag.isPending}
            onClick={() => {
              setDeleteError(null);
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash2 data-slot="icon" aria-hidden="true" />
            <DropdownLabel>Remove tag</DropdownLabel>
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Dialog
        open={isRenameDialogOpen}
        onClose={setIsRenameDialogOpen}
        size="lg"
      >
        <DialogTitle>Edit Tag</DialogTitle>
        <DialogDescription>Change this tag’s name.</DialogDescription>
        <form onSubmit={handleRenameTag} className="mt-5 space-y-5">
          <label className="block text-sm font-medium text-[var(--app-ink)]">
            Name
            <input
              autoFocus
              required
              value={tagNameDraft}
              onChange={(e) => setTagNameDraft(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--app-line)] bg-[var(--app-card)] px-3 text-[var(--app-ink)] focus:outline-2 focus:outline-[var(--app-primary)]"
            />
          </label>
          {renameError ? <p className="text-sm text-red-600" role="alert">{renameError}</p> : null}
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
              disabled={!tagNameDraft.trim() || updateTag.isPending}
            >
              {updateTag.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Remove tag"
        description={`Remove “${tag.name}”? This removes the tag from every bookmark but does not delete the bookmarks.`}
        confirmLabel="Remove tag"
        busyLabel="Removing..."
        busy={deleteTag.isPending}
        error={deleteError}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteTag()}
      />
    </>
  );
}
