import { act } from "react";
import type { Editor } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/bookmark";
import NoteEditorDialog from "./NoteEditorDialog";
import type { EntryDraft } from "../lib/entryDrafts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  updateNote: vi.fn(),
  createNote: vi.fn(),
  encryptField: vi.fn(async (value: string) => `encrypted:${value}`),
  cryptoKey: {} as CryptoKey | null,
  userId: "user-1",
  saveDraft: vi.fn(),
  removeDraft: vi.fn(),
  readDrafts: vi.fn(),
  entryCount: 0,
  accountPlan: undefined as
    | { limits: { entries: number; tags: number } }
    | undefined,
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ user: { id: mocks.userId } }),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({ encryptField: mocks.encryptField, cryptoKey: mocks.cryptoKey }),
}));

vi.mock("../lib/entryDrafts", () => ({
  openEntryDraftLease: async (userId: string) => ({ userId, generation: "" }),
  readEntryDrafts: mocks.readDrafts,
  saveEntryDraft: mocks.saveDraft,
  removeEntryDraft: mocks.removeDraft,
}));

vi.mock("../hooks/useNotesQuery", () => ({
  useCreateNote: () => ({ mutateAsync: mocks.createNote }),
  useUpdateNote: () => ({ mutateAsync: mocks.updateNote }),
}));

vi.mock("../hooks/useEntriesQuery", () => ({
  useEntryCount: () => ({ data: mocks.entryCount }),
}));

vi.mock("../hooks/useFoldersQuery", () => ({
  useFolders: () => ({ data: [], isLoading: false }),
}));

vi.mock("../hooks/useTagsQuery", () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({ data: mocks.accountPlan }),
}));

const existingNote: Note = {
  kind: "note",
  id: "note-1",
  user_id: "user-1",
  title: "Existing note",
  content: "<p>Keep this <strong>actual content</strong>.</p>",
  created_at: "2026-08-03T10:00:00.000Z",
  updated_at: "2026-08-03T10:00:00.000Z",
};

describe("NoteEditorDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.updateNote.mockReset().mockResolvedValue(undefined);
    mocks.createNote.mockReset().mockResolvedValue("created-note-1");
    mocks.encryptField.mockClear();
    mocks.cryptoKey = {} as CryptoKey;
    mocks.userId = "user-1";
    mocks.saveDraft.mockReset().mockResolvedValue(undefined);
    mocks.removeDraft.mockReset().mockResolvedValue(undefined);
    mocks.readDrafts.mockReset().mockResolvedValue({ drafts: [], unreadable: false });
    mocks.entryCount = 0;
    mocks.accountPlan = undefined;
    vi.stubGlobal("ResizeObserver", class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(),
    });
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("mounts an existing note body when a closed editor is opened", async () => {
    await act(async () => {
      root.render(
        <NoteEditorDialog open={false} note={null} onClose={() => {}} />,
      );
    });

    await act(async () => {
      root.render(
        <NoteEditorDialog open note={existingNote} onClose={() => {}} />,
      );
    });

    const editor = document.querySelector<HTMLDivElement>(
      '[aria-label="Document content"]',
    );
    expect(editor?.innerHTML).toBe(existingNote.content);
    expect(editor?.textContent).toContain("Keep this actual content.");

    await act(async () => {
      editor!.innerHTML = "<p>Updated content that stays visible.</p>";
      editor!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });

    expect(editor?.textContent).toBe("Updated content that stays visible.");

    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(mocks.updateNote).toHaveBeenCalledWith({
      noteId: existingNote.id,
      title: "encrypted:Existing note",
      content: "encrypted:<p>Updated content that stays visible.</p>",
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
  });

  it("creates an untitled note with empty content", async () => {
    await act(async () => {
      root.render(<NoteEditorDialog open note={null} onClose={() => {}} />);
    });

    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(mocks.createNote).toHaveBeenCalledWith({
      title: "encrypted:Untitled document",
      content: "encrypted:",
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
  });

  function activeEditor(): Editor {
    return (
      document.querySelector(".tiptap") as HTMLElement & { editor: Editor }
    ).editor;
  }

  async function openNote(content = "") {
    await act(async () =>
      root.render(
        <NoteEditorDialog
          open
          note={content ? { ...existingNote, content } : null}
          onClose={() => {}}
        />,
      ),
    );
    return activeEditor();
  }

  async function click(label: string) {
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
        .click(),
    );
  }

  async function submit() {
    await act(async () =>
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
  }

  it("keeps the full writing toolbar for documents", async () => {
    await openNote();
    expect(document.querySelector('.entry-composer[data-variant="full"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Text style"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Insert table"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="More formatting"]')).toBeNull();
    expect(document.querySelector(".entry-writing-dialog")?.className).toContain("sm:max-w-5xl");
  });

  it("turns an active quote back into a normal paragraph", async () => {
    const editor = await openNote(
      "<blockquote><p>Quoted text</p></blockquote>",
    );
    await act(async () => {
      editor.commands.setTextSelection(3);
    });
    expect(
      document
        .querySelector('[aria-label="Quote"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    await click("Quote");
    expect(editor.getHTML()).not.toContain("<blockquote>");
    expect(editor.getHTML()).toContain("<p>Quoted text</p>");
    await click("Undo");
    expect(editor.getHTML()).toContain("<blockquote>");
  });

  it("turns a bulleted list into a checkbox list and saves checked items", async () => {
    const editor = await openNote("<ul><li><p>Pack charger</p></li></ul>");
    await act(async () => {
      editor.commands.setTextSelection(3);
    });
    await click("Checkbox list");
    expect(document.querySelector('ul[data-checklist="true"]')).not.toBeNull();
    await act(async () =>
      document
        .querySelector<HTMLInputElement>('.tiptap input[type="checkbox"]')!
        .click(),
    );
    await submit();
    const saved = new DOMParser().parseFromString(
      mocks.updateNote.mock.calls[0][0].content.replace(/^encrypted:/, ""),
      "text/html",
    );
    expect(
      saved.querySelector('ul[data-checklist="true"] input[checked]'),
    ).not.toBeNull();
    expect(saved.body.textContent).toBe("Pack charger");
  });

  it("loads legacy checkbox states and exits an empty last checklist item", async () => {
    const editor = await openNote(
      '<ul data-checklist="true"><li><input type="checkbox" checked>First item</li><li><input type="checkbox"><br></li></ul>',
    );
    expect(
      document.querySelector<HTMLInputElement>(".tiptap input")?.checked,
    ).toBe(true);
    await act(async () => {
      let emptyItemPosition = 0;
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === "taskItem" && !node.textContent)
          emptyItemPosition = position + 2;
      });
      editor.commands.setTextSelection(emptyItemPosition);
      editor.commands.keyboardShortcut("Enter");
    });
    expect(editor.getHTML()).toContain('checked=""');
    expect(document.querySelectorAll(".tiptap li")).toHaveLength(1);
    expect(document.querySelector(".tiptap ul + p")).not.toBeNull();
  });

  it("pastes semantic formatting, safe links and tables without executable HTML", async () => {
    await openNote();
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: {
        files: [],
        getData: (type: string) =>
          type === "text/html"
            ? '<h2>Heading</h2><p><span style="font-weight:700;font-style:italic">Formatted</span> <a href="https://example.com">Link</a><img src="https://tracker.example/pixel"><script>bad()</script></p><table><tr><td>Cell</td></tr></table>'
            : "",
      },
    });
    await act(async () => {
      document.querySelector(".tiptap")!.dispatchEvent(paste);
    });
    await submit();
    const content = mocks.createNote.mock.calls[0][0].content;
    expect(content).toContain("<h2>Heading</h2>");
    expect(content).toContain("<strong>");
    expect(content).toContain("<em>");
    expect(content).toContain('href="https://example.com"');
    expect(content).toContain("<table>");
    expect(content).not.toMatch(/script|tracker|style=/);
  });

  it("does not mark a legacy document dirty just by entering focus mode", async () => {
    await openNote(
      '<ul data-checklist="true"><li><input type="checkbox">Keep this</li></ul>',
    );
    await click("Enter focus mode");
    expect(document.body.textContent).not.toContain("Unsaved changes");
  });

  it("copies sanitized HTML and plain text together, and reports clipboard failures", async () => {
    const items: Record<string, Blob>[] = [];
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(value: Record<string, Blob>) {
          items.push(value);
        }
      },
    );
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText },
    });
    await openNote("<h2>Heading</h2><p><strong>Text</strong></p>");
    const copy = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Copy with formatting",
    )!;
    await act(async () => copy.click());
    expect(write).toHaveBeenCalledOnce();
    const readBlob = (blob: Blob) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
      });
    expect(await readBlob(items[0]["text/html"])).toContain(
      "<h2>Heading</h2><p><strong>Text</strong></p>",
    );
    expect(await readBlob(items[0]["text/plain"])).toBe("Heading\nText");
    write.mockRejectedValueOnce(new Error("denied"));
    await act(async () => copy.click());
    expect(document.body.textContent).toContain(
      "Could not access the clipboard",
    );
    const plain = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Copy plain text",
    )!;
    await act(async () => plain.click());
    expect(writeText).toHaveBeenCalledWith("Heading\nText");
  });

  it("uses a single fullscreen focus control and preserves the document and selection", async () => {
    const editor = await openNote("<p>Keep writing here.</p>");
    await act(async () => {
      editor.commands.setTextSelection(6);
    });
    expect(document.querySelector('[aria-label="Expand editor"]')).toBeNull();
    await click("Enter focus mode");
    expect(activeEditor()).toBe(editor);
    expect(editor.state.selection.from).toBe(6);
    expect(document.querySelector("details")?.hidden).toBe(true);
    expect(document.querySelector(".entry-writing-dialog")?.className).toContain(
      "min-h-dvh",
    );
    expect(
      document.querySelector<HTMLElement>(".entry-copy-actions")?.hidden,
    ).toBe(true);
    await click("Exit focus mode");
    expect(editor.getHTML()).toBe("<p>Keep writing here.</p>");
    expect(document.querySelector("details")?.hidden).toBe(false);
    expect(document.querySelector(".entry-writing-dialog")?.className).not.toContain(
      "min-h-dvh",
    );
  });

  async function toggleWidth(label: string) {
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(button?.closest(".entry-writing-actions")).not.toBeNull();
    expect(document.querySelector('[aria-label="Editor options"]')).toBeNull();
    expect(button?.nextElementSibling?.getAttribute("aria-label")).toMatch(/focus mode$/);
    await click(label);
    expect(button?.getAttribute("aria-pressed")).toBe(label === "Use full width" ? "true" : "false");
  }

  it("keeps the save button's fixed-width styling through pending and completed saves", async () => {
    let finishSave!: (id: string) => void;
    mocks.createNote.mockImplementationOnce(() => new Promise<string>((resolve) => { finishSave = resolve; }));
    await openNote();
    const saveButton = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(saveButton.textContent).toBe("Save");
    expect(saveButton.classList.contains("entry-writing-save")).toBe(true);
    const classes = saveButton.className;

    await submit();
    expect(saveButton.textContent).toBe("Saving…");
    expect(saveButton.disabled).toBe(true);
    expect(saveButton.className).toBe(classes);

    await act(async () => finishSave("created-note-1"));
    expect(saveButton.textContent).toBe("Save");
    expect(saveButton.disabled).toBe(false);
    expect(saveButton.className).toBe(classes);
    expect(document.querySelector('button[type="submit"]')).toBe(saveButton);
  });

  it("changes width independently of Focus without marking the document edited", async () => {
    const editor = await openNote("<p>Keep writing here.</p>");
    await act(async () => editor.commands.setTextSelection(6));
    const panel = () => document.querySelector(".entry-writing-dialog")!;
    expect(panel().classList.contains("entry-writing-dialog-wide")).toBe(false);
    await toggleWidth("Use full width");
    expect(panel().classList.contains("entry-writing-dialog-wide")).toBe(true);
    expect(panel().className).not.toContain("min-h-dvh");
    expect(document.querySelector("details")?.hidden).toBe(false);
    expect(activeEditor()).toBe(editor);
    expect(editor.state.selection.from).toBe(6);
    expect(document.body.textContent).not.toContain("Unsaved changes");

    await click("Enter focus mode");
    expect(panel().classList.contains("entry-writing-dialog-wide")).toBe(true);
    expect(panel().className).toContain("min-h-dvh");
    await toggleWidth("Use comfortable width");
    expect(panel().classList.contains("entry-writing-dialog-wide")).toBe(false);
    expect(panel().className).toContain("min-h-dvh");
    expect(document.querySelector("details")?.hidden).toBe(true);
    await toggleWidth("Use full width");
    await click("Exit focus mode");
    expect(panel().classList.contains("entry-writing-dialog-wide")).toBe(true);
    expect(panel().className).not.toContain("min-h-dvh");
    expect(editor.getHTML()).toBe("<p>Keep writing here.</p>");
    expect(editor.state.selection.from).toBe(6);
  });

  it("preserves unsaved edits and undo history across width changes and saving", async () => {
    const editor = await openNote("<p>Original writing</p>");
    await act(async () => editor.commands.insertContent("New "));
    const draft = editor.getHTML();
    await toggleWidth("Use full width");
    expect(document.body.textContent).toContain("Unsaved changes");
    expect(editor.getHTML()).toBe(draft);
    await submit();
    expect(document.querySelector(".entry-writing-dialog-wide")).not.toBeNull();
    expect(document.body.textContent).toContain("Saved");
    await toggleWidth("Use comfortable width");
    await click("Undo");
    expect(editor.getHTML()).toBe("<p>Original writing</p>");
    expect(document.body.textContent).toContain("Unsaved changes");
  });

  it("defaults to comfortable width when the editor is reopened", async () => {
    await openNote();
    await toggleWidth("Use full width");
    await act(async () =>
      root.render(<NoteEditorDialog open={false} note={null} onClose={() => {}} />),
    );
    await openNote();
    expect(document.querySelector(".entry-writing-dialog-wide")).toBeNull();
  });

  it("keeps a newly saved note open and updates its ID on subsequent saves", async () => {
    const onClose = vi.fn();
    await act(async () =>
      root.render(<NoteEditorDialog open note={null} onClose={onClose} />),
    );
    const editor = activeEditor();
    await act(async () => {
      editor.commands.setContent("<p>First draft</p>");
      editor.commands.setTextSelection(4);
    });
    await click("Enter focus mode");
    await submit();
    expect(onClose).not.toHaveBeenCalled();
    expect(activeEditor()).toBe(editor);
    expect(editor.state.selection.from).toBe(4);
    expect(document.body.textContent).toContain("Saved");
    expect(document.body.textContent).not.toContain("Unsaved changes");
    expect(
      document.querySelector('[aria-label="Exit focus mode"]'),
    ).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>("#note-title")?.value).toBe(
      "Untitled document",
    );
    // The first save can fill the quota; updates must still be allowed.
    mocks.entryCount = 1;
    mocks.accountPlan = { limits: { entries: 1, tags: 100 } };
    await act(async () => editor.commands.setContent("<p>Second draft</p>"));
    expect(document.body.textContent).toContain("Unsaved changes");
    await act(async () =>
      document.querySelector("form")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s", ctrlKey: true, bubbles: true, cancelable: true,
        }),
      ),
    );
    expect(mocks.createNote).toHaveBeenCalledOnce();
    expect(mocks.updateNote).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: "created-note-1",
        content: "encrypted:<p>Second draft</p>",
      }),
    );
    const confirm = vi.spyOn(window, "confirm");
    await click("Close");
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clears the saved baseline only on success and retains undo and unsaved-close protection", async () => {
    const onClose = vi.fn();
    await act(async () =>
      root.render(<NoteEditorDialog open note={existingNote} onClose={onClose} />),
    );
    const editor = activeEditor();
    await act(async () => editor.commands.insertContent("First edit "));
    await submit();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Saved");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    await click("Undo");
    expect(document.body.textContent).toContain("Unsaved changes");
    mocks.updateNote.mockRejectedValueOnce(new Error("Save failed"));
    await submit();
    expect(document.body.textContent).toContain("Save failed");
    expect(document.body.textContent).toContain("Unsaved changes");
    mocks.saveDraft.mockRejectedValue(new Error("Storage unavailable"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await click("Close");
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("prevents duplicate creates while a save is pending", async () => {
    let resolveSave!: (id: string) => void;
    mocks.createNote.mockImplementationOnce(
      () => new Promise<string>((resolve) => { resolveSave = resolve; }),
    );
    const editor = await openNote();
    await act(async () => {
      const form = document.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.createNote).toHaveBeenCalledOnce();
    expect(editor.isEditable).toBe(true);
    await act(async () => resolveSave("created-note-1"));
    expect(editor.isEditable).toBe(true);
    await submit();
    expect(mocks.updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: "created-note-1" }),
    );
  });

  it("does not replace unsaved writing when a background query refreshes", async () => {
    const editor = await openNote(existingNote.content);
    await act(async () => {
      editor.commands.setContent("<p>My unsaved draft</p>");
    });
    await act(async () =>
      root.render(
        <NoteEditorDialog
          open
          note={{ ...existingNote, content: "<p>Server refresh</p>" }}
          onClose={() => {}}
        />,
      ),
    );
    expect(activeEditor().getHTML()).toBe("<p>My unsaved draft</p>");
  });

  it("keeps over-limit text available but refuses to save it", async () => {
    const editor = await openNote();
    await act(async () => {
      editor.commands.setContent(`<p>${"x".repeat(10001)}</p>`);
    });
    await submit();
    expect(editor.getText()).toHaveLength(10001);
    expect(mocks.createNote).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("shorten it before saving");
  });

  it("keeps a failed save open with the user's content intact", async () => {
    mocks.updateNote.mockRejectedValueOnce(
      new Error("Could not save. Try again."),
    );
    const editor = await openNote("<p>Important writing</p>");
    await submit();
    expect(editor.getText()).toBe("Important writing");
    expect(document.body.textContent).toContain("Could not save. Try again.");
    expect(editor.isEditable).toBe(true);
  });

  it("confirms before discarding unsaved edits", async () => {
    mocks.saveDraft.mockRejectedValue(new Error("Storage unavailable"));
    const onClose = vi.fn();
    await act(async () =>
      root.render(
        <NoteEditorDialog open note={existingNote} onClose={onClose} />,
      ),
    );
    await act(async () => {
      activeEditor().commands.insertContent("Unsaved");
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await click("Close");
    expect(confirm).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await click("Close");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps new writing locally without creating a document automatically", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    await act(async () => root.render(<NoteEditorDialog open note={null} onClose={onClose} />));
    await act(async () => activeEditor().commands.setContent("<p>Local writing</p>"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(mocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      expect.objectContaining({ entryId: null, fields: expect.objectContaining({ content: "<p>Local writing</p>" }) }),
      mocks.cryptoKey,
    );
    expect(document.body.textContent).toContain("Saved on this device");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.createNote).not.toHaveBeenCalled();
    const confirm = vi.spyOn(window, "confirm");
    await click("Close");
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("serializes autosaves without freezing writing or marking later edits saved", async () => {
    vi.useFakeTimers();
    let resolveSave!: () => void;
    mocks.updateNote.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const editor = await openNote(existingNote.content);
    await act(async () => editor.commands.setContent("<p>First edit</p>"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.updateNote).toHaveBeenCalledOnce();
    expect(editor.isEditable).toBe(true);
    await act(async () => editor.commands.setContent("<p>Later edit</p>"));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mocks.updateNote).toHaveBeenCalledOnce();
    await act(async () => resolveSave());
    expect(editor.getHTML()).toBe("<p>Later edit</p>");
    expect(document.body.textContent).toContain("Saved on this device");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.updateNote).toHaveBeenCalledTimes(2);
    expect(mocks.updateNote).toHaveBeenLastCalledWith(expect.objectContaining({ content: "encrypted:<p>Later edit</p>" }));
  });

  it("pauses failed autosaves until a manual retry", async () => {
    vi.useFakeTimers();
    mocks.updateNote.mockRejectedValueOnce(new Error("Save failed"));
    const editor = await openNote(existingNote.content);
    await act(async () => editor.commands.insertContent("Update "));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.updateNote).toHaveBeenCalledOnce();
    await act(async () => editor.commands.insertContent("More "));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.updateNote).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Autosave paused");
    await submit();
    expect(mocks.updateNote).toHaveBeenCalledTimes(2);
  });

  it("stores offline edits and autosaves them after reconnecting while open", async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const editor = await openNote(existingNote.content);
    await act(async () => editor.commands.insertContent("Offline "));
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(mocks.saveDraft).toHaveBeenCalled();
    expect(mocks.updateNote).not.toHaveBeenCalled();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.updateNote).toHaveBeenCalledOnce();
  });

  it("offers recovered writing without automatically overwriting the account", async () => {
    vi.useFakeTimers();
    const recovery: EntryDraft = {
      id: "recovered", userId: "user-1", kind: "note", entryId: existingNote.id, updatedAt: Date.now(),
      fields: { title: "Recovered title", content: "<p><strong>Recovered body</strong></p>", selectedFolderId: "", dueDate: "", tags: [] },
    };
    mocks.readDrafts.mockResolvedValue({ drafts: [recovery], unreadable: false });
    await openNote(existingNote.content);
    expect(document.body.textContent).toContain("An unsaved draft");
    await submit();
    expect(mocks.updateNote).not.toHaveBeenCalled();
    const restore = [...document.querySelectorAll("button")].find((b) => b.textContent === "Restore draft")!;
    await act(async () => restore.click());
    expect(activeEditor().getHTML()).toBe(recovery.fields.content);
    expect(mocks.saveDraft).toHaveBeenCalled();
    expect(mocks.removeDraft).toHaveBeenCalledWith(expect.anything(), recovery.id, recovery.updatedAt);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mocks.updateNote).not.toHaveBeenCalled();
    await submit();
    expect(mocks.updateNote).toHaveBeenCalledOnce();
  });

  it("does not claim local recovery when storage fails", async () => {
    vi.useFakeTimers();
    mocks.saveDraft.mockRejectedValue(new Error("Quota exceeded"));
    await openNote();
    await act(async () => activeEditor().commands.insertContent("Keep me"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(document.body.textContent).not.toContain("Saved on this device");
    expect(document.body.textContent).toContain("Could not keep a local draft");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it("cancels pending autosave when the vault locks", async () => {
    vi.useFakeTimers();
    await openNote(existingNote.content);
    await act(async () => activeEditor().commands.insertContent("Private "));
    mocks.cryptoKey = null;
    await act(async () => root.render(<NoteEditorDialog open note={existingNote} onClose={() => {}} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(document.querySelector('[aria-label="Document content"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Private");
    expect(mocks.updateNote).not.toHaveBeenCalled();
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("pauses autosave when a newer account version arrives", async () => {
    vi.useFakeTimers();
    await openNote(existingNote.content);
    await act(async () => activeEditor().commands.setContent("<p>Local change</p>"));
    await act(async () => root.render(<NoteEditorDialog open note={{ ...existingNote, updated_at: "2026-08-27T12:00:00Z", content: "<p>Other device</p>" }} onClose={() => {}} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(activeEditor().getHTML()).toBe("<p>Local change</p>");
    expect(mocks.updateNote).not.toHaveBeenCalled();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await submit();
    expect(confirm).toHaveBeenCalled();
    expect(mocks.updateNote).not.toHaveBeenCalled();
  });

  it("does not send a save that finishes encryption after an account switch", async () => {
    let finishEncryption!: (value: string) => void;
    mocks.encryptField.mockImplementationOnce(() => new Promise<string>((resolve) => { finishEncryption = resolve; }));
    await openNote(existingNote.content);
    await submit();
    mocks.userId = "user-2";
    await act(async () => root.render(<NoteEditorDialog open note={existingNote} onClose={() => {}} />));
    await act(async () => finishEncryption("encrypted:old-account-title"));
    expect(mocks.updateNote).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(existingNote.title);
  });

  it("flushes the created document ID before closing with edits made during its first save", async () => {
    vi.useFakeTimers();
    let resolveSave!: (id: string) => void;
    mocks.createNote.mockImplementationOnce(() => new Promise<string>((resolve) => { resolveSave = resolve; }));
    const onClose = vi.fn();
    await act(async () => root.render(<NoteEditorDialog open note={null} onClose={onClose} />));
    await act(async () => activeEditor().commands.setContent("<p>Initial writing</p>"));
    await submit();
    await act(async () => activeEditor().commands.setContent("<p>Writing during Save</p>"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ entryId: null }), expect.anything());
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await act(async () => resolveSave("created-note-1"));
    await click("Close");
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ entryId: "created-note-1", fields: expect.objectContaining({ content: "<p>Writing during Save</p>" }) }), expect.anything());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("prevents creating a note after the current plan limit is reached", async () => {
    mocks.entryCount = 100;
    mocks.accountPlan = { limits: { entries: 100, tags: 100 } };

    await act(async () => {
      root.render(<NoteEditorDialog open note={null} onClose={() => {}} />);
    });

    const editor = document.querySelector<HTMLDivElement>(
      '[aria-label="Document content"]',
    )!;
    await act(async () => {
      editor.innerHTML = "<p>A note that exceeds the plan limit.</p>";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(document.body.textContent).toContain(
      "Entry limit reached. You can have at most 100 documents and tasks combined.",
    );
    expect(mocks.createNote).not.toHaveBeenCalled();
  });
});
