import { useState, type SubmitEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useDeleteTag, useUpdateTag } from "../hooks/useTagsQuery";
import { Button } from "./ui/button";
import { Dialog, DialogActions, DialogBody, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
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
      <Button
        plain
        onClick={openRenameDialog}
        className="theme-button-icon size-8! p-0! items-center"
        aria-label="Rename tag"
      >
        <Pencil className="size-3" />
      </Button>

      <Button
        plain
        onClick={() => {
          setDeleteError(null);
          setIsDeleteDialogOpen(true);
        }}
        disabled={deleteTag.isPending}
        className="inline-flex size-8! p-0! items-center justify-center rounded-lg text-red-500! hover:bg-red-50! hover:text-red-600! cursor-pointer"
        aria-label="Delete tag"
      >
        <Trash2 className="size-4" />
      </Button>

      <Dialog
        open={isRenameDialogOpen}
        onClose={setIsRenameDialogOpen}
        size="sm"
      >
        <form onSubmit={handleRenameTag}>
          <DialogTitle>Rename tag</DialogTitle>
          <DialogBody className="space-y-3">
            <Input
              type="text"
              aria-label="Tag name"
              value={tagNameDraft}
              onChange={(e) => setTagNameDraft(e.target.value)}
              placeholder="Tag name"
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
              disabled={updateTag.isPending}
            >
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Delete tag"
        description={`Delete “${tag.name}”? This removes the tag from every bookmark but does not delete the bookmarks.`}
        confirmLabel="Delete tag"
        busyLabel="Deleting..."
        busy={deleteTag.isPending}
        error={deleteError}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteTag()}
      />
    </>
  );
}
