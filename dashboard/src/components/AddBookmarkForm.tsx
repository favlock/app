import {
  useState,
  type SubmitEvent,
  type ChangeEvent,
  useEffect,
  useId,
  useRef,
} from "react";
import { hasReachedResourceLimit } from "@favlock/shared";
import { useFolders } from "../hooks/useFoldersQuery";
import {
  useAddBookmark,
  useBookmarkCounts,
  useUpdateBookmark,
} from "../hooks/useBookmarksQuery";
import { useTags } from "../hooks/useTagsQuery";
import type { Bookmark } from "../types/bookmark";
import { Check, ListChecks, PlusIcon, X } from "lucide-react";
import { Button } from "./ui/button";
import { Combobox, ComboboxOption, ComboboxLabel } from "./ui/combobox";
import { Dialog, DialogActions, DialogBody, DialogTitle } from "./ui/dialog";
import { ErrorMessage, Field, Label } from "./ui/fieldset";
import { Input } from "./ui/input";
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from "./ui/dropdown";
import { useEncryption } from "../context/useEncryption";
import { prepareBookmarkTags } from "../lib/bookmarkWrites";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useLists, useSetBookmarkLists } from "../hooks/useListsQuery";
import { getBookmarkListIds } from "../lib/lists";

interface AddBookmarkFormProps {
  onAdded: () => void;
  currentFolderId?: string | null;
  editBookmark?: Bookmark;
  open?: boolean;
  onClose?: () => void;
  hideTrigger?: boolean;
  initialUrl?: string;
  initialTitle?: string;
}

export function AddBookmarkButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      color="emerald"
      className="min-h-11 items-center gap-2 whitespace-nowrap"
      aria-label="Add bookmark"
    >
      <PlusIcon data-slot="icon" aria-hidden="true" />
      <span className="hidden sm:inline">Add bookmark</span>
    </Button>
  );
}

export default function AddBookmarkForm({
  onAdded,
  currentFolderId,
  editBookmark,
  open: openProp,
  onClose,
  hideTrigger,
  initialUrl,
  initialTitle,
}: AddBookmarkFormProps) {
  const isEditMode = !!editBookmark;
  const formId = useId();
  const urlInputId = `${formId}-url`;
  const titleInputId = `${formId}-title`;
  const folderInputId = `${formId}-folder`;
  const listInputId = `${formId}-lists`;
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlledOpen = openProp !== undefined;
  const open = isControlledOpen ? openProp : internalOpen;
  const { encryptField } = useEncryption();
  const { data: folders = [], isLoading: foldersLoading } = useFolders();
  const { data: existingTags = [] } = useTags();
  const listsQuery = useLists({ enabled: open });
  const lists = listsQuery.data ?? [];
  const { data: bookmarkCounts } = useBookmarkCounts();
  const { data: accountPlan } = useAccountPlan();
  const addBookmarkMutation = useAddBookmark();
  const updateBookmarkMutation = useUpdateBookmark();
  const setBookmarkListsMutation = useSetBookmarkLists();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [comboboxQuery, setComboboxQuery] = useState("");
  const [comboboxKey, setComboboxKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const initializedListContextRef = useRef<string | null>(null);

  const resetForm = () => {
    setUrl("");
    setTitle("");
    setSelectedFolderId("");
    setSelectedListIds([]);
    setTags([]);
    setComboboxQuery("");
    setComboboxKey((k) => k + 1);
    setError(null);
    initializedListContextRef.current = null;
  };

  // Pre-fill form when editing
  useEffect(() => {
    if (!isEditMode || !openProp || !editBookmark) return;
    setUrl(editBookmark.url);
    setTitle(editBookmark.title);
    setSelectedFolderId(editBookmark.folders?.[0]?.id || "");
    setTags(editBookmark.tags?.map((t) => t.name) || []);
    setComboboxKey((k) => k + 1);
  }, [editBookmark, isEditMode, openProp]);

  useEffect(() => {
    if (!open) {
      initializedListContextRef.current = null;
      return;
    }
    if (!listsQuery.data) return;

    const contextKey = isEditMode && editBookmark
      ? `edit:${editBookmark.id}`
      : "create";
    if (initializedListContextRef.current === contextKey) return;

    setSelectedListIds(
      isEditMode && editBookmark
        ? getBookmarkListIds(listsQuery.data, editBookmark.id)
        : [],
    );
    initializedListContextRef.current = contextKey;
  }, [editBookmark, isEditMode, listsQuery.data, open]);

  // Allow external deep links to pre-fill create mode.
  useEffect(() => {
    if (isEditMode || !open) return;
    if (initialUrl !== undefined) {
      setUrl(initialUrl);
    }
    if (initialTitle !== undefined) {
      setTitle(initialTitle);
    }
  }, [isEditMode, open, initialUrl, initialTitle]);

  // Reflect the collection the user opened the shared create dialog from.
  useEffect(() => {
    if (isEditMode || !open || foldersLoading) return;
    setSelectedFolderId(
      currentFolderId && folders.some((folder) => folder.id === currentFolderId)
        ? currentFolderId
        : "",
    );
  }, [currentFolderId, folders, foldersLoading, isEditMode, open]);

  const addTag = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.replace(/#/g, "").trim().toLowerCase())
      .filter(Boolean);
    setTags((prev) => {
      const next = [...prev];
      for (const part of parts) {
        if (!next.includes(part) && next.length < 10) next.push(part);
      }
      return next;
    });
    setComboboxQuery("");
    setComboboxKey((k) => k + 1);
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const toggleList = (listId: string) => {
    setSelectedListIds((current) =>
      current.includes(listId)
        ? current.filter((id) => id !== listId)
        : [...current, listId],
    );
  };

  const handleClose = () => {
    resetForm();
    if (isControlledOpen || isEditMode) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
  };

  const isValidUrlWithTld = (value: string) => {
    const cleaned = value.replace(/^https?:\/\//i, "").trim();
    const host = cleaned.split("/")[0] ?? "";
    if (!host || host.includes(" ")) {
      return false;
    }

    if (host.startsWith(".") || host.endsWith(".")) {
      return false;
    }

    if (!host.includes(".")) {
      return false;
    }

    const tld = host.split(".").pop() ?? "";
    return /^[a-z]{2,}$/i.test(tld);
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (listsQuery.error) {
      setError("Could not load Lists. Close this dialog and try again.");
      return;
    }
    if (listsQuery.isLoading || !listsQuery.data) return;

    const existingTagNames = new Set(
      existingTags.map((tag) => tag.name.trim().toLowerCase()),
    );
    const newTagCount = new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag && !existingTagNames.has(tag)),
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

    if (isEditMode) {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setIsSubmitting(true);
      try {
        const preparedTags = await prepareBookmarkTags(
          tags,
          existingTags,
          encryptField,
        );
        await updateBookmarkMutation.mutateAsync({
          bookmarkId: editBookmark!.id,
          title: await encryptField(title),
          folderId: selectedFolderId || null,
          ...preparedTags,
        });
        await setBookmarkListsMutation.mutateAsync({
          bookmarkId: editBookmark!.id,
          listIds: selectedListIds,
        });
        resetForm();
        onClose?.();
        onAdded();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update bookmark",
        );
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
      return;
    }

    const rawUrl = url.trim();
    if (
      accountPlan &&
      hasReachedResourceLimit(
        bookmarkCounts?.bookmarkCount ?? 0,
        accountPlan.limits.bookmarks,
      )
    ) {
      setError(
        `Bookmark limit reached. You can have at most ${accountPlan.limits.bookmarks} bookmarks.`,
      );
      return;
    }

    if (!isValidUrlWithTld(rawUrl)) {
      setError("URL must contain a valid domain");
      return;
    }
    const normalizedUrl = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://${rawUrl}`;
    const fallbackTitle = normalizedUrl
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");

    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const folderId = selectedFolderId || currentFolderId || null;
      const preparedTags = await prepareBookmarkTags(
        tags,
        existingTags,
        encryptField,
      );
      const bookmarkId = await addBookmarkMutation.mutateAsync({
        title: await encryptField(title || fallbackTitle || "Bookmark"),
        url: await encryptField(normalizedUrl),
        folderId,
        ...preparedTags,
      });
      if (selectedListIds.length) {
        await setBookmarkListsMutation.mutateAsync({
          bookmarkId,
          listIds: selectedListIds,
        });
      }

      resetForm();
      setInternalOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add bookmark");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isPending =
    isSubmitting ||
    setBookmarkListsMutation.isPending ||
    (isEditMode
      ? updateBookmarkMutation.isPending
      : addBookmarkMutation.isPending);
  const selectedCollectionName = selectedFolderId
    ? folders.find((folder) => folder.id === selectedFolderId)?.name
    : undefined;
  const organizationParts = [
    selectedCollectionName ? `Collection: ${selectedCollectionName}` : null,
    tags.length > 0
      ? `${tags.length} ${tags.length === 1 ? "tag" : "tags"}`
      : null,
    selectedListIds.length > 0
      ? `${selectedListIds.length} ${selectedListIds.length === 1 ? "List" : "Lists"}`
      : null,
  ].filter(Boolean);
  const organizationSummary = organizationParts.length
    ? organizationParts.join(" · ")
    : "optional";

  return (
    <>
      {!isEditMode && !hideTrigger && (
        <AddBookmarkButton onClick={() => setInternalOpen(true)} />
      )}

      <Dialog
        open={open}
        onClose={isPending ? () => {} : handleClose}
        size="xl"
        backdropClassName="bg-[color-mix(in_oklab,var(--app-line)_28%,transparent)]! backdrop-blur-md"
        className="overflow-hidden border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_92%,white)]! p-0! shadow-[0_28px_80px_-30px_color-mix(in_oklab,var(--app-line)_42%,transparent)] ring-0!"
      >
        <div className="relative border-b border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-[color-mix(in_oklab,var(--app-card-strong)_26%,var(--app-card))] px-5 py-5 sm:px-8 sm:py-6">
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                className="inline-flex size-11 flex-none items-center justify-center rounded-xl border border-[color-mix(in_oklab,var(--app-primary)_16%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))] text-[var(--app-primary)] shadow-sm"
                aria-hidden="true"
              >
                <PlusIcon size={21} />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-xl/7! text-[var(--app-ink)]! sm:text-2xl/8!">
                  {isEditMode ? "Edit bookmark" : "New bookmark"}
                </DialogTitle>
                <p className="mt-0.5 text-sm text-[var(--app-muted)]">
                  {isEditMode
                    ? "Update the details for this saved link."
                    : "Save a link and keep it easy to find."}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isPending}
              className="theme-button-icon inline-flex size-11 flex-none"
              aria-label="Close"
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <DialogBody className="mt-0! px-5 py-6 sm:px-8 sm:py-7">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
            id={formId}
          >
            <Field>
              <Label htmlFor={urlInputId} className="text-[var(--app-ink)]!">
                URL <span className="text-[var(--app-primary)]">*</span>
              </Label>
              <Input
                className="liquid-input before:bg-[color-mix(in_oklab,var(--app-card)_84%,white)]! after:ring-[color-mix(in_oklab,var(--app-primary)_62%,transparent)]!"
                id={urlInputId}
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setUrl(e.target.value)
                }
                required
                inputMode="url"
                autoComplete="url"
                disabled={isEditMode}
              />
              {error && <ErrorMessage>{error}</ErrorMessage>}
            </Field>

            <Field>
              <Label
                htmlFor={titleInputId}
                className="text-[var(--app-ink)]!"
              >
                Title
                {isEditMode ? (
                  <span className="text-[var(--app-primary)]"> *</span>
                ) : (
                  <span className="ml-1 font-normal text-[var(--app-muted)]">
                    (optional)
                  </span>
                )}
              </Label>
              <Input
                className="liquid-input before:bg-[color-mix(in_oklab,var(--app-card)_84%,white)]! after:ring-[color-mix(in_oklab,var(--app-primary)_62%,transparent)]!"
                id={titleInputId}
                type="text"
                placeholder={
                  isEditMode
                    ? "Bookmark title"
                    : "We’ll use the website address if left blank"
                }
                value={title}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTitle(e.target.value)
                }
                required={isEditMode}
              />
            </Field>

            <details
              open={isEditMode ? true : undefined}
              className="rounded-xl border border-[color-mix(in_oklab,var(--app-line)_10%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_62%,white)] p-3"
            >
              <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--app-ink)]">
                Organize{" "}
                <span className="font-normal text-[var(--app-muted)]">
                  ({organizationSummary})
                </span>
              </summary>
              <div className="mt-4 space-y-5">
              <Field>
              <Label
                htmlFor={folderInputId}
                className="text-[var(--app-ink)]!"
              >
                Collection
              </Label>
              <div data-slot="control">
                <Dropdown>
                  <DropdownButton
                    id={folderInputId}
                    outline
                    disabled={foldersLoading}
                    className="w-full justify-between text-left"
                  >
                    {foldersLoading
                      ? "Loading collections..."
                      : selectedFolderId
                        ? folders.find((f) => f.id === selectedFolderId)
                            ?.name || "Select collection"
                        : "No collection"}
                  </DropdownButton>
                  <DropdownMenu
                    anchor="bottom start"
                    className="min-w-[var(--button-width)]"
                  >
                    <DropdownItem onClick={() => setSelectedFolderId("")}>
                      No collection
                    </DropdownItem>
                    {folders.length === 0 ? (
                      <DropdownItem disabled>No collections created</DropdownItem>
                    ) : (
                      folders.map((folder) => (
                        <DropdownItem
                          key={folder.id}
                          onClick={() => setSelectedFolderId(folder.id)}
                        >
                          {folder.parent_id ? `↳ ${folder.name}` : folder.name}
                        </DropdownItem>
                      ))
                    )}
                  </DropdownMenu>
                </Dropdown>
              </div>
              </Field>

              <Field>
                <Label id={listInputId} className="text-[var(--app-ink)]!">
                  Lists
                </Label>
                <div
                  data-slot="control"
                  aria-labelledby={listInputId}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {listsQuery.isLoading ? (
                    <p className="text-sm text-[var(--app-muted)]">Loading Lists...</p>
                  ) : listsQuery.error ? (
                    <p className="text-sm text-red-600">
                      Could not load Lists. Close this dialog and try again.
                    </p>
                  ) : lists.length ? (
                    lists.map((list) => {
                      const selected = selectedListIds.includes(list.id);
                      return (
                        <button
                          key={list.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleList(list.id)}
                          className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-left text-sm font-medium transition ${
                            selected
                              ? "border-[var(--app-primary)] bg-[color-mix(in_oklab,var(--app-primary)_10%,var(--app-card))] text-[var(--app-primary)]"
                              : "border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-white/55 text-[var(--app-ink)] hover:border-[color-mix(in_oklab,var(--app-primary)_38%,transparent)]"
                          }`}
                        >
                          <span className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-[var(--app-primary)] bg-[var(--app-primary)] text-white" : "border-[color-mix(in_oklab,var(--app-line)_24%,transparent)] text-transparent"}`}>
                            <Check size={13} aria-hidden="true" />
                          </span>
                          <ListChecks size={15} aria-hidden="true" />
                          <span className="truncate">{list.name}</span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="text-sm text-[var(--app-muted)]">
                      No Lists created yet.
                    </p>
                  )}
                </div>
              </Field>

              <Field>
              <Label className="text-[var(--app-ink)]!">Tags</Label>
              <div data-slot="control" className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Combobox<string>
                    key={comboboxKey}
                    options={existingTags
                      .map((t) => t.name)
                      .filter((n) => !tags.includes(n))}
                    displayValue={(v) => v ?? ""}
                    value={undefined}
                    onChange={(name) => {
                      if (name) addTag(name);
                    }}
                    onQueryChange={setComboboxQuery}
                    onInputKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (comboboxQuery.trim()) addTag(comboboxQuery.trim());
                      }
                    }}
                    placeholder="Add or search tag..."
                    disabled={tags.length >= 10}
                    className="liquid-input flex-1 before:bg-[color-mix(in_oklab,var(--app-card)_84%,white)]! after:ring-[color-mix(in_oklab,var(--app-primary)_62%,transparent)]!"
                  >
                    {(option) => (
                      <ComboboxOption value={option}>
                        <ComboboxLabel>#{option}</ComboboxLabel>
                      </ComboboxOption>
                    )}
                  </Combobox>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--app-primary)_16%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_12%,var(--app-card))] px-2.5 py-1 text-sm font-medium text-[var(--app-primary)]"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="rounded-full text-[var(--app-primary)] transition-colors hover:text-[var(--app-ink)] cursor-pointer"
                          aria-label={`Delete tag ${tag}`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {tags.length >= 10 && (
                  <p className="text-sm text-amber-600 ">
                    You reached the 10-tag limit.
                  </p>
                )}
              </div>
              </Field>
              </div>
            </details>
          </form>
        </DialogBody>

        <DialogActions className="mt-0! border-t border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card-strong)_32%,var(--app-card))] px-5 py-5 sm:px-8">
          <Button
            type="button"
            onClick={handleClose}
            outline
            className="min-w-24"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isPending || listsQuery.isLoading || !!listsQuery.error}
            color="emerald"
            className="min-w-28"
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
