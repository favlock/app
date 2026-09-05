import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useEditor } from "@tiptap/react";
import { ArrowLeftRight, Copy, Focus, X } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useEntryCount } from "../hooks/useEntriesQuery";
import { useFolders } from "../hooks/useFoldersQuery";
import { useTags } from "../hooks/useTagsQuery";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useEntryDraft } from "../hooks/useEntryDraft";
import { prepareBookmarkTags } from "../lib/bookmarkWrites";
import {
  ENTRY_CONTENT_MAX_LENGTH,
  ENTRY_TITLE_MAX_LENGTH,
  getEntryTextLength,
  getEntryPlainText,
  sanitizeEntryHtml,
} from "../lib/entryContent";
import { entryEditorExtensions } from "../lib/entryEditor";
import { copyEntryContent } from "../lib/entryClipboard";
import { validateEntryWriteSize } from "../lib/entryRepository";
import type { Entry, EntryKind } from "../types/bookmark";
import EntryRichTextEditor from "./EntryRichTextEditor";
import { Button } from "./ui/button";
import { Dialog, DialogTitle } from "./ui/dialog";
import { ErrorMessage, Field, Label } from "./ui/fieldset";
import { Input } from "./ui/input";
import { Combobox, ComboboxLabel, ComboboxOption } from "./ui/combobox";
import {
  Dropdown,
  DropdownFieldButton,
  DropdownItem,
  DropdownMenu,
} from "./ui/dropdown";

export type EntryEditorValues = {
  title: string;
  content: string;
  folderId: string | null;
  existingTagIds: string[];
  newEncryptedTagNames: string[];
  dueDate?: string | null;
};

export type EntryEditorUpdateValues = EntryEditorValues & {
  entryId: string;
};

interface EntryEditorDialogProps {
  open: boolean;
  kind: EntryKind;
  entry?: Entry | null;
  onClose: () => void;
  onCreate: (values: EntryEditorValues) => Promise<string>;
  onUpdate: (values: EntryEditorUpdateValues) => Promise<unknown>;
}

// Each open gets its own editing session. Background query refreshes must not
// replace an in-progress draft or reset its undo stack.
export default function EntryEditorDialog(props: EntryEditorDialogProps) {
  const { user } = useAuth();
  const { cryptoKey } = useEncryption();
  return props.open && user && cryptoKey && (!props.entry || props.entry.user_id === user.id) ? (
    <EntryEditorSession key={`${user?.id}:${props.entry?.id ?? props.kind}`} {...props} />
  ) : null;
}

function EntryEditorSession({
  kind,
  entry,
  onClose,
  onCreate,
  onUpdate,
}: EntryEditorDialogProps) {
  const [initialEntry] = useState(entry);
  const [entryId, setEntryId] = useState(initialEntry?.id);
  const { user } = useAuth();
  const { encryptField, cryptoKey } = useEncryption();
  const { data: folders = [], isLoading: foldersLoading } = useFolders();
  const { data: existingTags = [] } = useTags();
  const { data: accountPlan } = useAccountPlan();
  const { data: entryCount = 0 } = useEntryCount();
  const [title, setTitle] = useState(initialEntry?.title ?? "");
  const [content, setContent] = useState(() =>
    sanitizeEntryHtml(initialEntry?.content ?? ""),
  );
  const [bodyChanged, setBodyChanged] = useState(false);
  const [savedContent, setSavedContent] = useState(content);
  const [isRecovering, setIsRecovering] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState(
    initialEntry?.folder?.id ?? "",
  );
  const [dueDate, setDueDate] = useState(
    initialEntry?.kind === "todo" ? (initialEntry.due_date ?? "") : "",
  );
  const [tags, setTags] = useState<string[]>(
    initialEntry?.tags?.map((tag) => tag.name) ?? [],
  );
  const [savedFields, setSavedFields] = useState(() => ({
    title,
    selectedFolderId,
    dueDate,
    tags,
  }));
  const [hasSaved, setHasSaved] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagInputKey, setTagInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const bodyRevision = useRef(0);
  const saveSession = useRef({ active: false });
  const [autosavePaused, setAutosavePaused] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [focused, setFocused] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);
  const isTodo = kind === "todo";
  const singular = isTodo ? "task" : "document";
  const displayName = isTodo ? "Task" : "Document";
  const plural = isTodo ? "Tasks" : "Documents";
  const isEditMode = !!entryId;
  const editor = useEditor({
    extensions: entryEditorExtensions(),
    content,
    editorProps: {
      attributes: {
        class: "entry-editor entry-rich-text",
        role: "textbox",
        "aria-label": `${displayName} ${isTodo ? "details" : "content"}`,
        "aria-multiline": "true",
        "data-placeholder": "Start writing…",
      },
      transformPastedHTML: sanitizeEntryHtml,
      handlePaste: (_view, event) => {
        if (event.clipboardData?.files.length) {
          setError(
            "Images and attachments are not supported yet. Paste text instead.",
          );
          // Keep any accompanying text, but never load clipboard image URLs.
          return (
            !event.clipboardData.getData("text/html") &&
            !event.clipboardData.getData("text/plain")
          );
        }
        return false;
      },
    },
    onUpdate: ({ editor: current, transaction }) => {
      setContent(current.isEmpty ? "" : sanitizeEntryHtml(current.getHTML()));
      // Selection-only transactions may append Tiptap's trailing paragraph.
      // Merely focusing a legacy document must not mark it as edited.
      if (transaction.docChanged) {
        bodyRevision.current += 1;
        setBodyChanged(true);
      }
      setCopyStatus("");
    },
  });
  const contentLength = getEntryTextLength(content);
  const words = getEntryPlainText(content).match(/\S+/gu)?.length ?? 0;
  const dirty =
    bodyChanged ||
    title !== savedFields.title ||
    selectedFolderId !== savedFields.selectedFolderId ||
    dueDate !== savedFields.dueDate ||
    JSON.stringify(tags) !== JSON.stringify(savedFields.tags);

  const draft = useEntryDraft({
    userId: user?.id, cryptoKey, kind, initialEntryId: initialEntry?.id, entryId,
    fields: { title, content, selectedFolderId, dueDate, tags }, dirty,
  });
  const unlocked = !!user && !!cryptoKey;
  const changedElsewhere = !!entry && entry.updated_at !== initialEntry?.updated_at && (
    entry.title !== savedFields.title || sanitizeEntryHtml(entry.content ?? "") !== savedContent ||
    (entry.folder?.id ?? "") !== savedFields.selectedFolderId ||
    (entry.kind === "todo" ? entry.due_date ?? "" : "") !== savedFields.dueDate ||
    JSON.stringify((entry.tags ?? []).map((tag) => tag.name).sort()) !== JSON.stringify([...savedFields.tags].sort())
  );
  useEffect(() => {
    const session = { active: unlocked };
    saveSession.current = session;
    if (!unlocked) setIsSubmitting(false);
    return () => { session.active = false; };
  }, [unlocked, cryptoKey]);
  useEffect(() => {
    editor?.setEditable(unlocked && !isRecovering, false);
  }, [editor, unlocked, isRecovering]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if ((!dirty || draft.localSaved) && !isSubmitting) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, draft.localSaved, isSubmitting]);

  const requestClose = async () => {
    if (submitting.current || isRecovering) return;
    if (dirty && !draft.localSaved && !await draft.flush() &&
        !window.confirm("A local draft could not be saved. Close and discard these changes?")) return;
    onClose();
  };
  const copyContent = async (plainText: boolean) => {
    try {
      const html = editor?.isEmpty ? "" : (editor?.getHTML() ?? content);
      await copyEntryContent(html, plainText);
      setCopyStatus(
        plainText ? "Copied as plain text" : "Copied with formatting",
      );
    } catch {
      setCopyStatus(
        "Could not access the clipboard. Select the text and copy it with your keyboard.",
      );
    }
  };
  const addTag = (rawTag: string) => {
    const normalized = rawTag.replace(/#/g, "").trim().toLowerCase();
    if (!normalized) return;
    setTags((current) =>
      current.includes(normalized) || current.length >= 10
        ? current
        : [...current, normalized],
    );
    setTagQuery("");
    setTagInputKey((key) => key + 1);
  };

  const save = useCallback(async () => {
    if (submitting.current) return;
    const session = saveSession.current;
    if (!session.active) return;
    setError(null);
    if (!navigator.onLine) {
      setError("You’re offline. Save to your account when you’re back online.");
      return;
    }

    const cleanContent = editor?.isEmpty
      ? ""
      : sanitizeEntryHtml(editor?.getHTML() ?? content);
    if (getEntryTextLength(cleanContent) > ENTRY_CONTENT_MAX_LENGTH) {
      setError(
        `${plural} can contain up to ${ENTRY_CONTENT_MAX_LENGTH.toLocaleString()} characters.`,
      );
      return;
    }

    if (!user) {
      setError(
        `Your session has expired. Sign in again to save this ${singular}.`,
      );
      return;
    }

    if (!entryId && accountPlan && entryCount >= accountPlan.limits.entries) {
      setError(
        `Entry limit reached. You can have at most ${accountPlan.limits.entries} documents and tasks combined.`,
      );
      return;
    }

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

    submitting.current = true;
    setIsSubmitting(true);
    const revision = bodyRevision.current;
    try {
      const entryTitle = title.trim() || `Untitled ${singular}`;
      const encryptedTitle = await encryptField(entryTitle);
      const encryptedContent = await encryptField(cleanContent);
      const preparedTags = await prepareBookmarkTags(
        tags,
        existingTags,
        encryptField,
      );

      const values: EntryEditorValues = {
        title: encryptedTitle,
        content: encryptedContent,
        folderId: selectedFolderId || null,
        ...(isTodo ? { dueDate: dueDate || null } : {}),
        ...preparedTags,
      };
      validateEntryWriteSize(kind, values);
      if (!session.active) return;
      if (entryId) {
        await onUpdate({
          entryId,
          ...values,
        });
      } else {
        const createdId = await onCreate(values);
        if (!session.active) return;
        setEntryId(createdId);
      }

      if (!session.active) return;
      setTitle((current) => current === title ? entryTitle : current);
      setSavedFields({ title: entryTitle, selectedFolderId, dueDate, tags });
      setSavedContent(cleanContent);
      setBodyChanged(bodyRevision.current !== revision);
      setHasSaved(true);
      setAutosavePaused(false);
    } catch (caughtError) {
      if (!session.active) return;
      setAutosavePaused(true);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : `Could not ${isEditMode ? "update" : "create"} this ${singular}.`,
      );
    } finally {
      submitting.current = false;
      if (session.active) setIsSubmitting(false);
    }
  }, [editor, content, plural, user, singular, entryId, accountPlan, entryCount,
    existingTags, tags, title, encryptField, selectedFolderId, isTodo, dueDate,
    kind, onUpdate, onCreate, isEditMode]);

  // New encrypted tags cannot be safely resent until sync supplies their IDs.
  // Creating a document stays explicit because POST has no idempotency key.
  const hasUnresolvedTags = tags.some((name) =>
    !existingTags.some((tag) => tag.name.trim().toLowerCase() === name.trim().toLowerCase()));
  useEffect(() => {
    if (!entryId || !dirty || !online || !unlocked || isSubmitting ||
        autosavePaused || error || draft.loading || draft.recovery.length || hasUnresolvedTags || changedElsewhere) return;
    const timer = window.setTimeout(() => { void save(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [entryId, dirty, online, unlocked, isSubmitting, autosavePaused, error,
    draft.loading, draft.recovery.length, hasUnresolvedTags, changedElsewhere, save]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.loading || draft.recovery.length || isRecovering) return;
    if (changedElsewhere && !window.confirm("This document changed elsewhere. Replace the account version with your current writing?")) return;
    void save();
  };

  return (
    <Dialog
      open
      onClose={() => (focused ? setFocused(false) : void requestClose())}
      size={isTodo ? "3xl" : "5xl"}
      fullScreen={focused}
      className={`entry-writing-dialog ${isTodo ? "entry-writing-dialog-compact" : ""} ${fullWidth ? "entry-writing-dialog-wide" : ""} overflow-hidden p-0!`}
    >
      <form
        onSubmit={handleSubmit}
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "s"
          ) {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
        }}
      >
        <header className="entry-writing-header">
          <DialogTitle className="text-[var(--app-ink)]!">
            {focused
              ? "Focus mode"
              : isEditMode
                ? `Edit ${singular}`
                : `New ${singular}`}
          </DialogTitle>
          <div className="entry-writing-actions">
            <button
              type="button"
              aria-label={fullWidth ? "Use comfortable width" : "Use full width"}
              aria-pressed={fullWidth}
              title={fullWidth ? "Use comfortable width" : "Use full width"}
              disabled={isSubmitting}
              onClick={() => {
                setFullWidth((value) => !value);
                editor?.commands.focus();
              }}
            >
              <ArrowLeftRight size={18} aria-hidden="true" />
              <span className="hidden sm:inline">Full width</span>
            </button>
            <button
              type="button"
              aria-label={focused ? "Exit focus mode" : "Enter focus mode"}
              aria-pressed={focused}
              title={focused ? "Exit focus mode" : "Enter focus mode"}
              disabled={isSubmitting}
              onClick={() => {
                setFocused((value) => !value);
                editor?.commands.focus();
              }}
            >
              <Focus size={18} />
              <span className="hidden sm:inline">
                {focused ? "Exit focus" : "Focus"}
              </span>
            </button>
            <Button
              type="submit"
              color="emerald"
              className="entry-writing-save"
              disabled={isSubmitting || !editor || !unlocked || isRecovering || draft.loading || draft.recovery.length > 0}
            >
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
            <button
              type="button"
              aria-label="Close"
              title="Close"
              disabled={isSubmitting}
              onClick={() => void requestClose()}
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="entry-writing-page">
          {draft.recovery[0] && (
            <div className="mb-5 rounded-lg border border-[var(--app-muted)]/25 p-3 text-sm" role="region" aria-label="Draft recovery">
              <p className="font-semibold">An unsaved draft is on this device</p>
              <p className="mt-1 text-[var(--app-muted)]">
                From {new Date(draft.recovery[0].updatedAt).toLocaleString()}.
                {draft.recovery.length > 1 ? ` ${draft.recovery.length} drafts available.` : ""}
                {" "}Restore to review it before saving to your account.
                {entryId ? " This may replace newer account changes." : ""}
              </p>
              <div className="mt-3 flex gap-3">
                <Button type="button" outline disabled={isRecovering || !unlocked} onClick={async () => {
                  const recovered = draft.recovery[0];
                  if (dirty && !window.confirm("Replace your current writing with this recovered draft?")) return;
                  setIsRecovering(true);
                  const adopted = await draft.adopt(recovered);
                  setIsRecovering(false);
                  if (!adopted) return;
                  setTitle(recovered.fields.title);
                  setSelectedFolderId(recovered.fields.selectedFolderId);
                  setDueDate(recovered.fields.dueDate);
                  setTags(recovered.fields.tags);
                  editor?.commands.setContent(recovered.fields.content);
                  setContent(recovered.fields.content);
                  setBodyChanged(true);
                  setAutosavePaused(true);
                }}>Restore draft</Button>
                <Button type="button" plain disabled={isRecovering || !unlocked} onClick={() => {
                  if (window.confirm("Permanently discard this local draft?")) void draft.discardRecovery(draft.recovery[0]);
                }}>Discard draft</Button>
              </div>
            </div>
          )}
          <fieldset disabled={!unlocked || isRecovering} className="min-w-0">
            <label className="sr-only" htmlFor={`${kind}-title`}>
              Title
            </label>
            <input
              id={`${kind}-title`}
              className="entry-writing-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={ENTRY_TITLE_MAX_LENGTH}
              placeholder={`Untitled ${singular}`}
              autoFocus
            />
            <details
              className="entry-writing-details"
              open={isTodo ? true : undefined}
              hidden={focused}
            >
              <summary>
                Collection and tags{isTodo ? " · Due date" : ""}
              </summary>
              <div
                className={`mt-4 grid gap-4 ${isTodo ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
              >
                {isTodo ? (
                  <Field>
                    <Label
                      htmlFor="todo-due-date"
                      className="text-[var(--app-ink)]!"
                    >
                      Due date{" "}
                      <span className="font-normal text-[var(--app-muted)]">
                        (optional)
                      </span>
                    </Label>
                    <Input
                      id="todo-due-date"
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </Field>
                ) : null}
                <Field>
                  <Label className="text-[var(--app-ink)]!">Collection</Label>
                  <div data-slot="control">
                    <Dropdown>
                      <DropdownFieldButton
                        disabled={foldersLoading}
                      >
                        {foldersLoading
                          ? "Loading collections..."
                          : selectedFolderId
                            ? folders.find(
                                (folder) => folder.id === selectedFolderId,
                              )?.name || "Select collection"
                            : "No collection"}
                      </DropdownFieldButton>
                      <DropdownMenu
                        anchor="bottom start"
                        className="min-w-[var(--button-width)]"
                      >
                        <DropdownItem onClick={() => setSelectedFolderId("")}>
                          No collection
                        </DropdownItem>
                        {folders.map((folder) => (
                          <DropdownItem
                            key={folder.id}
                            onClick={() => setSelectedFolderId(folder.id)}
                          >
                            {folder.parent_id
                              ? `↳ ${folder.name}`
                              : folder.name}
                          </DropdownItem>
                        ))}
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                </Field>

                <Field>
                  <Label className="text-[var(--app-ink)]!">Tags</Label>
                  <Combobox<string>
                    key={tagInputKey}
                    options={existingTags
                      .map((tag) => tag.name)
                      .filter((name) => !tags.includes(name))}
                    displayValue={(value) => value ?? ""}
                    value={undefined}
                    onChange={(name) => name && addTag(name)}
                    onQueryChange={setTagQuery}
                    onInputKeyDown={(event) => {
                      if (event.key === "Enter" && tagQuery.trim()) {
                        event.preventDefault();
                        addTag(tagQuery);
                      }
                    }}
                    placeholder="Add or search tag..."
                    disabled={tags.length >= 10}
                  >
                    {(option) => (
                      <ComboboxOption value={option}>
                        <ComboboxLabel>#{option}</ComboboxLabel>
                      </ComboboxOption>
                    )}
                  </Combobox>
                </Field>
              </div>

              {tags.length > 0 ? (
                <div
                  className="mt-2 flex flex-wrap gap-1.5"
                  aria-label={`${displayName} tags`}
                >
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--app-primary)_16%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_12%,var(--app-card))] px-2.5 py-1 text-sm font-medium text-[var(--app-primary)]"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() =>
                          setTags((current) =>
                            current.filter((item) => item !== tag),
                          )
                        }
                        className="cursor-pointer rounded-full"
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </details>
          </fieldset>
          <EntryRichTextEditor
            editor={editor}
            disabled={!unlocked || isRecovering}
            focused={focused}
            variant={isTodo ? "compact" : "full"}
          />
          <footer className="entry-writing-footer">
            <span>
              {words.toLocaleString()} {words === 1 ? "word" : "words"}{" "}
              <span
                className={
                  contentLength > ENTRY_CONTENT_MAX_LENGTH ? "text-red-600" : ""
                }
              >
                · {contentLength.toLocaleString()}/
                {ENTRY_CONTENT_MAX_LENGTH.toLocaleString()} characters
              </span>
            </span>
            <span role="status">
              {isSubmitting
                ? "Saving…"
                : dirty
                  ? draft.localSaved ? "Saved on this device" : "Unsaved changes"
                  : hasSaved
                    ? "Saved"
                    : "Encrypted when saved"}
            </span>
            <div className="entry-copy-actions" hidden={focused}>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void copyContent(false)}
              >
                <Copy size={14} />
                Copy with formatting
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void copyContent(true)}
              >
                Copy plain text
              </button>
            </div>
          </footer>
          {copyStatus && (
            <p className="mt-2 text-sm text-[var(--app-muted)]" role="status">
              {copyStatus}
            </p>
          )}
          {contentLength > ENTRY_CONTENT_MAX_LENGTH && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {plural} can contain up to{" "}
              {ENTRY_CONTENT_MAX_LENGTH.toLocaleString()} characters. Your text
              is still here; shorten it before saving.
            </p>
          )}
          {error && (
            <div role="alert">
              <ErrorMessage className="mt-3">{error}</ErrorMessage>
            </div>
          )}
          {draft.error && <p role="alert" className="mt-3 text-sm text-red-600">{draft.error}</p>}
          {!unlocked && <p role="status" className="mt-3 text-sm">Unlock your vault to continue writing.</p>}
          {changedElsewhere && <p role="alert" className="mt-3 text-sm text-[var(--app-muted)]">This document changed elsewhere. Autosave is paused; review your writing before replacing the account version.</p>}
          {dirty && !online && <p role="status" className="mt-3 text-sm text-[var(--app-muted)]">Offline · account save is waiting for a connection.</p>}
          {dirty && online && (autosavePaused || hasUnresolvedTags) && (
            <p className="mt-3 text-sm text-[var(--app-muted)]">Autosave paused. Review your changes and press Save to sync them.</p>
          )}
          {!focused && (
            <p className="mt-4 text-xs text-[var(--app-muted)]">
              {entryId ? "Changes autosave after you pause. " : "Press Save to add this to your account; later edits autosave. "}
              Save anytime with ⌘S or Ctrl+S. Local drafts are cleared when you sign out.
            </p>
          )}
        </div>
      </form>
    </Dialog>
  );
}
