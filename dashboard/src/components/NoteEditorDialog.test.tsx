import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../types/bookmark";
import NoteEditorDialog from "./NoteEditorDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  updateNote: vi.fn(),
  createNote: vi.fn(),
  execCommand: vi.fn(() => true),
  encryptField: vi.fn(async (value: string) => `encrypted:${value}`),
  entryCount: 0,
  accountPlan: undefined as
    | { limits: { entries: number; tags: number } }
    | undefined,
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({ encryptField: mocks.encryptField }),
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
    mocks.createNote.mockReset().mockResolvedValue(undefined);
    mocks.execCommand.mockClear();
    mocks.encryptField.mockClear();
    mocks.entryCount = 0;
    mocks.accountPlan = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: mocks.execCommand,
    });
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("mounts an existing note body when a closed editor is opened", async () => {
    await act(async () => {
      root.render(<NoteEditorDialog open={false} note={null} onClose={() => {}} />);
    });

    await act(async () => {
      root.render(
        <NoteEditorDialog open note={existingNote} onClose={() => {}} />,
      );
    });

    const editor = document.querySelector<HTMLDivElement>(
      '[aria-label="Note content"]',
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
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mocks.createNote).toHaveBeenCalledWith({
      title: "encrypted:Untitled note",
      content: "encrypted:",
      folderId: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
  });

  it("turns an active quote back into a normal paragraph", async () => {
    await act(async () => {
      root.render(<NoteEditorDialog open note={null} onClose={() => {}} />);
    });

    const editor = document.querySelector<HTMLDivElement>(
      '[aria-label="Note content"]',
    )!;
    editor.innerHTML = "<blockquote>Quoted text</blockquote>";
    const quoteText = editor.querySelector("blockquote")!.firstChild!;
    const range = document.createRange();
    range.setStart(quoteText, 1);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);

    await act(async () => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    const quoteButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Quote"]',
    )!;
    expect(quoteButton.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      quoteButton.click();
    });

    expect(mocks.execCommand).toHaveBeenCalledWith("formatBlock", false, "p");
  });

  it("turns a bulleted list into a checkbox list and saves checked items", async () => {
    await act(async () => {
      root.render(<NoteEditorDialog open note={null} onClose={() => {}} />);
    });

    const editor = document.querySelector<HTMLDivElement>(
      '[aria-label="Note content"]',
    )!;
    editor.innerHTML = "<ul><li>Pack charger</li></ul>";
    const itemText = editor.querySelector("li")!.firstChild!;
    const range = document.createRange();
    range.setStart(itemText, 1);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);

    await act(async () => {
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Checkbox list"]',
      )!.click();
    });

    const checkbox = editor.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(editor.querySelector("ul")?.getAttribute("data-checklist")).toBe(
      "true",
    );
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox.click();
      document
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mocks.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        content:
          'encrypted:<ul data-checklist="true"><li><input type="checkbox" checked="">Pack charger</li></ul>',
      }),
    );
  });

  it("exits a checkbox list when Enter is pressed on its empty last item", async () => {
    await act(async () => {
      root.render(<NoteEditorDialog open note={null} onClose={() => {}} />);
    });

    const editor = document.querySelector<HTMLDivElement>(
      '[aria-label="Note content"]',
    )!;
    editor.innerHTML =
      '<ul data-checklist="true"><li><input type="checkbox">First item</li><li><input type="checkbox"><br></li></ul>';
    const emptyItem = editor.querySelectorAll("li")[1];
    const range = document.createRange();
    range.selectNodeContents(emptyItem);
    range.collapse(false);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      editor.dispatchEvent(enter);
    });

    expect(enter.defaultPrevented).toBe(true);
    expect(editor.querySelectorAll("li")).toHaveLength(1);
    expect(editor.querySelector("li")?.textContent).toBe("First item");
    const paragraph = editor.querySelector("ul + p");
    expect(paragraph).not.toBeNull();
    expect(document.getSelection()?.anchorNode).toBe(paragraph);
  });

  it("prevents creating a note after the current plan limit is reached", async () => {
    mocks.entryCount = 100;
    mocks.accountPlan = { limits: { entries: 100, tags: 100 } };

    await act(async () => {
      root.render(<NoteEditorDialog open note={null} onClose={() => {}} />);
    });

    const editor = document.querySelector<HTMLDivElement>(
      '[aria-label="Note content"]',
    )!;
    await act(async () => {
      editor.innerHTML = "<p>A note that exceeds the plan limit.</p>";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      document
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(document.body.textContent).toContain(
      "Entry limit reached. You can have at most 100 notes and tasks combined.",
    );
    expect(mocks.createNote).not.toHaveBeenCalled();
  });
});
