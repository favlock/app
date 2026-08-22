import { useEffect, useState, type FormEvent } from "react";
import { FolderCog, X } from "lucide-react";
import { useEncryption } from "../context/useEncryption";
import { useFolders } from "../hooks/useFoldersQuery";
import { useUpdateReadspaceOrganization } from "../hooks/useReadspaceQuery";
import { useTags } from "../hooks/useTagsQuery";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { prepareBookmarkTags } from "../lib/bookmarkWrites";
import type { ReadspaceEntry } from "../types/bookmark";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "./ui/dialog";
import { ErrorMessage } from "./ui/fieldset";
import ReadspaceOrganizationFields from "./ReadspaceOrganizationFields";

export default function ReadspaceOrganizationDialog({
  article,
  onClose,
}: {
  article: ReadspaceEntry | null;
  onClose: () => void;
}) {
  const { encryptField } = useEncryption();
  const { data: folders = [], isLoading: foldersLoading } = useFolders();
  const { data: existingTags = [] } = useTags();
  const { data: accountPlan } = useAccountPlan();
  const updateOrganization = useUpdateReadspaceOrganization();
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!article) return;
    setSelectedFolderId(article.folder?.id ?? "");
    setTags(article.tags?.map((tag) => tag.name) ?? []);
    setError(null);
  }, [article]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!article) return;
    setError(null);

    const existingTagNames = new Set(
      existingTags.map((tag) => tag.name.trim().toLowerCase()),
    );
    const newTagCount = new Set(
      tags.filter((tag) => !existingTagNames.has(tag.trim().toLowerCase())),
    ).size;
    if (
      accountPlan &&
      accountPlan.limits.tags > 0 &&
      existingTags.length + newTagCount > accountPlan.limits.tags
    ) {
      setError(
        `Tag limit reached. You can have at most ${accountPlan.limits.tags} tags.`,
      );
      return;
    }

    try {
      const preparedTags = await prepareBookmarkTags(
        tags,
        existingTags,
        encryptField,
      );
      await updateOrganization.mutateAsync({
        entryId: article.id,
        folderId: selectedFolderId || null,
        ...preparedTags,
      });
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not organize this article.",
      );
    }
  };

  return (
    <Dialog
      open={!!article}
      onClose={updateOrganization.isPending ? () => {} : onClose}
      size="lg"
    >
      {article ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[var(--app-primary)]">
                <FolderCog size={18} aria-hidden="true" />
                <DialogTitle>Organize article</DialogTitle>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--app-muted)]">
                {article.title}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={updateOrganization.isPending}
              className="theme-button-icon inline-flex size-9 flex-none"
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <DialogBody>
            <form onSubmit={handleSubmit}>
              <ReadspaceOrganizationFields
                folders={folders}
                foldersLoading={foldersLoading}
                existingTags={existingTags}
                selectedFolderId={selectedFolderId}
                tags={tags}
                onFolderChange={setSelectedFolderId}
                onTagsChange={setTags}
                disabled={updateOrganization.isPending}
              />

              {error ? <ErrorMessage className="mt-3">{error}</ErrorMessage> : null}

              <DialogActions className="mt-6">
                <Button
                  type="button"
                  plain
                  onClick={onClose}
                  disabled={updateOrganization.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  color="emerald"
                  disabled={updateOrganization.isPending}
                >
                  {updateOrganization.isPending ? "Saving..." : "Save organization"}
                </Button>
              </DialogActions>
            </form>
          </DialogBody>
        </>
      ) : null}
    </Dialog>
  );
}
