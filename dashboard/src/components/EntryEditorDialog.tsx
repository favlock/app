import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Bold,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useEntryCount } from "../hooks/useEntriesQuery";
import { useFolders } from "../hooks/useFoldersQuery";
import { useTags } from "../hooks/useTagsQuery";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { prepareBookmarkTags } from "../lib/bookmarkWrites";
import {
  ENTRY_CONTENT_MAX_LENGTH,
  ENTRY_TITLE_MAX_LENGTH,
  getEntryTextLength,
  sanitizeEntryHtml,
} from "../lib/entryContent";
import type { Entry, EntryKind } from "../types/bookmark";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "./ui/dialog";
import { ErrorMessage, Field, Label } from "./ui/fieldset";
import { Input } from "./ui/input";
import { Combobox, ComboboxLabel, ComboboxOption } from "./ui/combobox";
import {
  Dropdown,
  DropdownButton,
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
  onCreate: (values: EntryEditorValues) => Promise<unknown>;
  onUpdate: (values: EntryEditorUpdateValues) => Promise<unknown>;
}

interface ToolbarAction {
  label: string;
  command: string;
  value?: string;
  icon: typeof Bold;
  stateCommand?: string;
}

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  [
    { label: "Undo", command: "undo", icon: Undo2 },
    { label: "Redo", command: "redo", icon: Redo2 },
  ],
  [
    { label: "Bold", command: "bold", icon: Bold, stateCommand: "bold" },
    {
      label: "Italic",
      command: "italic",
      icon: Italic,
      stateCommand: "italic",
    },
    {
      label: "Underline",
      command: "underline",
      icon: Underline,
      stateCommand: "underline",
    },
    {
      label: "Strikethrough",
      command: "strikeThrough",
      icon: Strikethrough,
      stateCommand: "strikeThrough",
    },
  ],
  [
    {
      label: "Bulleted list",
      command: "insertUnorderedList",
      icon: List,
      stateCommand: "insertUnorderedList",
    },
    {
      label: "Numbered list",
      command: "insertOrderedList",
      icon: ListOrdered,
      stateCommand: "insertOrderedList",
    },
    {
      label: "Checkbox list",
      command: "insertChecklist",
      icon: ListChecks,
      stateCommand: "checklist",
    },
    {
      label: "Quote",
      command: "formatBlock",
      value: "blockquote",
      icon: Quote,
      stateCommand: "blockquote",
    },
  ],
  [
    {
      label: "Clear formatting",
      command: "removeFormat",
      icon: RemoveFormatting,
    },
  ],
];

function selectionIsInsideBlockquote(editor: HTMLDivElement | null): boolean {
  if (!editor) return false;

  const anchorNode = document.getSelection()?.anchorNode;
  const anchorElement =
    anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
  const blockquote = anchorElement?.closest("blockquote");
  return Boolean(blockquote && editor.contains(blockquote));
}

function selectedList(
  editor: HTMLDivElement | null,
  selector: "ul" | 'ul[data-checklist="true"]',
): HTMLUListElement | null {
  if (!editor) return null;

  const anchorNode = document.getSelection()?.anchorNode;
  const anchorElement =
    anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
  const list = anchorElement?.closest<HTMLUListElement>(selector) ?? null;
  return list && editor.contains(list) ? list : null;
}

function directListItems(list: HTMLUListElement): HTMLLIElement[] {
  return Array.from(list.children).filter(
    (child): child is HTMLLIElement => child instanceof HTMLLIElement,
  );
}

function findDirectCheckbox(item: HTMLLIElement): HTMLInputElement | null {
  const firstChild = item.firstElementChild;
  return firstChild instanceof HTMLInputElement && firstChild.type === "checkbox"
    ? firstChild
    : null;
}

function normalizeChecklistInputs(editor: HTMLDivElement): void {
  for (const list of editor.querySelectorAll<HTMLUListElement>(
    'ul[data-checklist="true"]',
  )) {
    for (const item of directListItems(list)) {
      let checkbox = findDirectCheckbox(item);
      if (!checkbox) {
        checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        item.prepend(checkbox);
      }
      const itemText = item.textContent?.trim();
      checkbox.setAttribute(
        "aria-label",
        itemText ? `Toggle ${itemText}` : "Toggle checklist item",
      );
    }
  }
}

function setChecklist(list: HTMLUListElement, enabled: boolean): void {
  if (enabled) {
    list.setAttribute("data-checklist", "true");
    const editor = list.closest<HTMLDivElement>(".entry-editor");
    if (editor) normalizeChecklistInputs(editor);
    return;
  }

  list.removeAttribute("data-checklist");
  for (const item of directListItems(list)) {
    findDirectCheckbox(item)?.remove();
  }
}

export default function EntryEditorDialog({
  open,
  kind,
  entry,
  onClose,
  onCreate,
  onUpdate,
}: EntryEditorDialogProps) {
  const { user } = useAuth();
  const { encryptField } = useEncryption();
  const { data: folders = [], isLoading: foldersLoading } = useFolders();
  const { data: existingTags = [] } = useTags();
  const { data: accountPlan } = useAccountPlan();
  const { data: entryCount = 0 } = useEntryCount();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValidHtmlRef = useRef("");
  const [title, setTitle] = useState("");
  const [contentLength, setContentLength] = useState(0);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [tagInputKey, setTagInputKey] = useState(0);
  const [activeCommands, setActiveCommands] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isTodo = kind === "todo";
  const singular = isTodo ? "task" : "note";
  const displayName = isTodo ? "Task" : "Note";
  const plural = isTodo ? "Tasks" : "Notes";
  const isEditMode = !!entry;
  const initialHtml = useMemo(
    () => sanitizeEntryHtml(entry?.content ?? ""),
    [entry],
  );
  const mountEditor = useCallback(
    (element: HTMLDivElement | null) => {
      editorRef.current = element;
      if (!element) return;

      element.innerHTML = initialHtml;
      normalizeChecklistInputs(element);
      lastValidHtmlRef.current = element.innerHTML;
    },
    [initialHtml],
  );

  useEffect(() => {
    if (!open) return;
    setTitle(entry?.title ?? "");
    setContentLength(getEntryTextLength(initialHtml));
    setSelectedFolderId(entry?.folder?.id ?? "");
    setDueDate(entry?.kind === "todo" ? (entry.due_date ?? "") : "");
    setTags(entry?.tags?.map((tag) => tag.name) ?? []);
    setTagQuery("");
    setTagInputKey((key) => key + 1);
    setError(null);
    lastValidHtmlRef.current = initialHtml;
  }, [entry, initialHtml, open]);

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

  const updateActiveCommands = useCallback(() => {
    const selection = document.getSelection();
    const anchorNode = selection?.anchorNode;
    if (!anchorNode || !editorRef.current?.contains(anchorNode)) return;

    const next = new Set<string>();
    for (const group of TOOLBAR_GROUPS) {
      for (const action of group) {
        if (!action.stateCommand) continue;
        try {
          const isActive =
            action.stateCommand === "blockquote"
              ? selectionIsInsideBlockquote(editorRef.current)
              : action.stateCommand === "checklist"
                ? Boolean(
                    selectedList(
                      editorRef.current,
                      'ul[data-checklist="true"]',
                    ),
                  )
                : action.stateCommand === "insertUnorderedList" &&
                    selectedList(
                      editorRef.current,
                      'ul[data-checklist="true"]',
                    )
                  ? false
              : document.queryCommandState(action.stateCommand);
          if (isActive) next.add(action.stateCommand);
        } catch {
          // Some browsers do not expose state for every editing command.
        }
      }
    }
    setActiveCommands(next);
  }, []);

  useEffect(() => {
    if (!open) return;

    document.addEventListener("selectionchange", updateActiveCommands);
    return () =>
      document.removeEventListener("selectionchange", updateActiveCommands);
  }, [open, updateActiveCommands]);

  const syncEditorState = () => {
    const editor = editorRef.current;
    if (!editor) return;

    normalizeChecklistInputs(editor);

    const nextLength = getEntryTextLength(editor.innerHTML);
    if (nextLength > ENTRY_CONTENT_MAX_LENGTH) {
      editor.innerHTML = lastValidHtmlRef.current;
      setContentLength(getEntryTextLength(lastValidHtmlRef.current));
      setError(`${plural} can contain up to ${ENTRY_CONTENT_MAX_LENGTH.toLocaleString()} characters.`);

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }

    lastValidHtmlRef.current = editor.innerHTML;
    setContentLength(nextLength);
    setError(null);
  };

  const runCommand = (action: ToolbarAction) => {
    const activeChecklist = selectedList(
      editorRef.current,
      'ul[data-checklist="true"]',
    );
    if (action.command === "insertChecklist") {
      const currentList = selectedList(editorRef.current, "ul");
      editorRef.current?.focus();
      if (currentList) {
        setChecklist(currentList, !activeChecklist);
      } else {
        document.execCommand("insertUnorderedList", false);
        const insertedList = selectedList(editorRef.current, "ul");
        if (insertedList) setChecklist(insertedList, true);
      }
      syncEditorState();
      updateActiveCommands();
      return;
    }

    if (action.command === "insertUnorderedList" && activeChecklist) {
      setChecklist(activeChecklist, false);
      syncEditorState();
      updateActiveCommands();
      return;
    }

    const shouldRemoveQuote =
      action.value === "blockquote" &&
      selectionIsInsideBlockquote(editorRef.current);
    editorRef.current?.focus();
    const value = shouldRemoveQuote ? "p" : action.value;
    document.execCommand(action.command, false, value);
    syncEditorState();
    updateActiveCommands();
  };

  const handleEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) ||
      target.type !== "checkbox" ||
      !target.closest('ul[data-checklist="true"]')
    ) {
      return;
    }

    if (target.checked) target.setAttribute("checked", "");
    else target.removeAttribute("checked");
    syncEditorState();
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;

    const checklist = selectedList(
      editorRef.current,
      'ul[data-checklist="true"]',
    );
    const anchorNode = document.getSelection()?.anchorNode;
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const previousItem = anchorElement?.closest<HTMLLIElement>("li") ?? null;
    if (!checklist || !previousItem || !checklist.contains(previousItem)) return;

    const itemText = previousItem.textContent?.replace(/[\s\u200b\ufeff]/g, "");
    const checklistItems = directListItems(checklist);
    if (!itemText && previousItem === checklistItems.at(-1)) {
      event.preventDefault();

      const paragraph = document.createElement("p");
      paragraph.append(document.createElement("br"));
      checklist.insertAdjacentElement("afterend", paragraph);
      previousItem.remove();
      if (directListItems(checklist).length === 0) checklist.remove();

      const selection = document.getSelection();
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      syncEditorState();
      updateActiveCommands();
      return;
    }

    window.setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) return;
      normalizeChecklistInputs(editor);

      const currentAnchor = document.getSelection()?.anchorNode;
      const currentElement =
        currentAnchor instanceof Element
          ? currentAnchor
          : currentAnchor?.parentElement;
      const nextItem = currentElement?.closest<HTMLLIElement>("li") ?? null;
      if (nextItem && nextItem !== previousItem && checklist.contains(nextItem)) {
        const checkbox = findDirectCheckbox(nextItem);
        if (checkbox) {
          checkbox.checked = false;
          checkbox.removeAttribute("checked");
        }
      }
      syncEditorState();
    }, 0);
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    syncEditorState();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const cleanContent = sanitizeEntryHtml(editorRef.current?.innerHTML ?? "");
    if (getEntryTextLength(cleanContent) > ENTRY_CONTENT_MAX_LENGTH) {
      setError(`${plural} can contain up to ${ENTRY_CONTENT_MAX_LENGTH.toLocaleString()} characters.`);
      return;
    }

    if (!user) {
      setError(`Your session has expired. Sign in again to save this ${singular}.`);
      return;
    }

    if (!entry && accountPlan && entryCount >= accountPlan.limits.entries) {
      setError(
        `Entry limit reached. You can have at most ${accountPlan.limits.entries} notes and tasks combined.`,
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

    setIsSubmitting(true);
    try {
      const entryTitle = title.trim() || `Untitled ${singular}`;
      const encryptedTitle = await encryptField(entryTitle);
      const encryptedContent = await encryptField(cleanContent);
      const preparedTags = await prepareBookmarkTags(
        tags,
        existingTags,
        encryptField,
      );

      if (entry) {
        await onUpdate({
          entryId: entry.id,
          title: encryptedTitle,
          content: encryptedContent,
          folderId: selectedFolderId || null,
          ...(isTodo ? { dueDate: dueDate || null } : {}),
          ...preparedTags,
        });
      } else {
        await onCreate({
          title: encryptedTitle,
          content: encryptedContent,
          folderId: selectedFolderId || null,
          ...(isTodo ? { dueDate: dueDate || null } : {}),
          ...preparedTags,
        });
      }

      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : `Could not ${isEditMode ? "update" : "create"} this ${singular}.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? () => {} : onClose}
      size="2xl"
      backdropClassName="bg-[color-mix(in_oklab,var(--app-line)_28%,transparent)]! backdrop-blur-md"
      className="overflow-hidden border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[color-mix(in_oklab,var(--app-card)_94%,white)]! p-0! shadow-[0_24px_80px_-24px_color-mix(in_oklab,var(--app-line)_45%,transparent),0_6px_0_color-mix(in_oklab,var(--app-line)_10%,transparent)] ring-0!"
    >
      <div className="relative overflow-hidden border-b border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[linear-gradient(120deg,color-mix(in_oklab,var(--app-hero-start)_92%,white),color-mix(in_oklab,var(--app-hero-mid)_82%,white),color-mix(in_oklab,var(--app-hero-end)_86%,white))] px-5 py-5 sm:px-8 sm:py-6">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-xl/7! text-[var(--app-ink)]! sm:text-2xl/8!">
              {isEditMode ? `Edit ${singular}` : `New ${singular}`}
            </DialogTitle>
            <p className="mt-0.5 text-sm text-[var(--app-muted)]">
              {isTodo
                ? "Capture a task and format the details that matter."
                : "Capture an idea and format the details that matter."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="theme-button-icon inline-flex size-9 flex-none"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <DialogBody className="mt-0! px-5 py-6 sm:px-8 sm:py-7">
        <form onSubmit={handleSubmit}>
          <Field>
            <Label htmlFor={`${kind}-title`} className="text-[var(--app-ink)]!">
              Title
            </Label>
            <Input
              id={`${kind}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={ENTRY_TITLE_MAX_LENGTH}
              placeholder={`Untitled ${singular}`}
              autoFocus
            />
            <p className="mt-1 text-right text-xs text-[var(--app-muted)]">
              {title.length}/{ENTRY_TITLE_MAX_LENGTH}
            </p>
          </Field>

          <div
            className={`mt-4 grid gap-4 ${isTodo ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
          >
            {isTodo ? (
              <Field>
                <Label htmlFor="todo-due-date" className="text-[var(--app-ink)]!">
                  Due date <span className="font-normal text-[var(--app-muted)]">(optional)</span>
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
                  <DropdownButton
                    outline
                    disabled={foldersLoading}
                    className="w-full justify-between text-left"
                  >
                    {foldersLoading
                      ? "Loading collections..."
                      : selectedFolderId
                        ? folders.find((folder) => folder.id === selectedFolderId)
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
                    {folders.map((folder) => (
                      <DropdownItem
                        key={folder.id}
                        onClick={() => setSelectedFolderId(folder.id)}
                      >
                        {folder.parent_id ? `↳ ${folder.name}` : folder.name}
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
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${displayName} tags`}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--app-primary)_16%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_12%,var(--app-card))] px-2.5 py-1 text-sm font-medium text-[var(--app-primary)]"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                    className="cursor-pointer rounded-full"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <Field className="mt-4">
            <Label className="text-[var(--app-ink)]!">
              {isTodo ? "Details" : "Content"}
            </Label>
            <div className="overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--app-line)_16%,transparent)] bg-white/86 shadow-sm focus-within:border-[color-mix(in_oklab,var(--app-primary)_48%,transparent)] focus-within:ring-2 focus-within:ring-[color-mix(in_oklab,var(--app-primary)_16%,transparent)]">
              <div
                role="toolbar"
                aria-label="Text formatting"
                className="flex flex-wrap items-center gap-1 border-b border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[color-mix(in_oklab,var(--app-card-strong)_44%,white)] p-2"
              >
                {TOOLBAR_GROUPS.map((group, groupIndex) => (
                  <div
                    key={group[0].label}
                    className={`flex items-center gap-1 ${groupIndex > 0 ? "ml-1 border-l border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] pl-2" : ""}`}
                  >
                    {group.map((action) => {
                      const Icon = action.icon;
                      const active = action.stateCommand
                        ? activeCommands.has(action.stateCommand)
                        : false;
                      return (
                        <button
                          key={action.label}
                          type="button"
                          title={action.label}
                          aria-label={action.label}
                          aria-pressed={action.stateCommand ? active : undefined}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => runCommand(action)}
                          className={`inline-flex size-8 items-center justify-center rounded-lg border transition-colors ${
                            active
                              ? "border-[color-mix(in_oklab,var(--app-primary)_28%,transparent)] bg-[color-mix(in_oklab,var(--app-primary)_14%,white)] text-[var(--app-primary)]"
                              : "border-transparent text-[var(--app-muted)] hover:border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] hover:bg-white/80 hover:text-[var(--app-ink)]"
                          }`}
                        >
                          <Icon size={16} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div
                key={entry?.id ?? `new-${kind}`}
                ref={mountEditor}
                role="textbox"
                aria-label={`${displayName} ${isTodo ? "details" : "content"}`}
                aria-multiline="true"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Start writing..."
                className="entry-editor min-h-56 max-h-[42vh] overflow-y-auto px-4 py-3 text-base leading-7 text-[var(--app-ink)] outline-none [&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--app-accent)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--app-muted)] [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
                onInput={syncEditorState}
                onClick={handleEditorClick}
                onKeyDown={handleEditorKeyDown}
                onPaste={handlePaste}
              />
            </div>
            <div className="mt-1 flex items-start justify-between gap-4">
              <p className="text-xs text-[var(--app-muted)]">
                Formatting is saved with your encrypted {singular}.
              </p>
              <p
                className={`whitespace-nowrap text-xs ${
                  contentLength >= ENTRY_CONTENT_MAX_LENGTH
                    ? "font-semibold text-red-600"
                    : "text-[var(--app-muted)]"
                }`}
              >
                {contentLength.toLocaleString()}/{ENTRY_CONTENT_MAX_LENGTH.toLocaleString()}
              </p>
            </div>
          </Field>

          {error ? <ErrorMessage className="mt-3">{error}</ErrorMessage> : null}

          <DialogActions className="mt-6">
            <Button type="button" plain onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" color="emerald" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isEditMode ? "Save changes" : `Create ${singular}`}
            </Button>
          </DialogActions>
        </form>
      </DialogBody>
    </Dialog>
  );
}
