import { act } from "react";
import type { Editor } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodoEditorDialog from "./TodoEditorDialog";
import type { Todo } from "../types/bookmark";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  encryptField: vi.fn(async (value: string) => `encrypted:${value}`),
  cryptoKey: {} as CryptoKey,
  entryCount: 0,
  accountPlan: undefined as
    | { limits: { entries: number; tags: number } }
    | undefined,
}));

const existingTodo: Todo = {
  kind: "todo",
  id: "todo-1",
  user_id: "user-1",
  title: "Plan the next step",
  content: "<p>Keep the useful context.</p>",
  is_completed: false,
  completed_at: null,
  due_date: "2026-09-01",
  created_at: "2026-08-28T08:00:00.000Z",
  updated_at: "2026-08-28T08:00:00.000Z",
};

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({ encryptField: mocks.encryptField, cryptoKey: mocks.cryptoKey }),
}));
vi.mock("../hooks/useEntryDraft", () => ({
  useEntryDraft: () => ({ recovery: [], loading: false, error: null, localSaved: false, flush: async () => false }),
}));
vi.mock("../hooks/useTodosQuery", () => ({
  useCreateTodo: () => ({ mutateAsync: mocks.createTodo }),
  useUpdateTodo: () => ({ mutateAsync: mocks.updateTodo }),
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

describe("TodoEditorDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.createTodo.mockReset().mockResolvedValue("created-todo-1");
    mocks.updateTodo.mockReset().mockResolvedValue(undefined);
    mocks.encryptField.mockClear();
    mocks.entryCount = 0;
    mocks.accountPlan = undefined;
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
  });

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  async function openTask(todo: Todo | null = null) {
    await act(async () => root.render(<TodoEditorDialog open todo={todo} onClose={() => {}} />));
    return (document.querySelector(".tiptap") as HTMLElement & { editor: Editor }).editor;
  }

  async function click(label: string) {
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
  }

  async function submit() {
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  }

  it("starts with compact task controls while retaining Focus, width, and a stable Save button", async () => {
    await openTask();
    expect(document.querySelector('.entry-composer[data-variant="compact"]')).not.toBeNull();
    expect(document.querySelector(".entry-writing-dialog")?.className).toContain("sm:max-w-3xl");
    expect([...document.querySelectorAll('.entry-toolbar button')].map((button) => button.getAttribute("aria-label"))).toEqual([
      "Undo", "Redo", "Bold", "Italic", "Bulleted list", "Numbered list", "Checkbox list", "Link", "More formatting",
    ]);
    expect(document.querySelector('[aria-label="Text style"]')).toBeNull();
    expect(document.querySelector('[aria-label="Enter focus mode"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Use full width"]')).not.toBeNull();
    expect(document.querySelector('button[type="submit"]')?.classList.contains("entry-writing-save")).toBe(true);
  });

  it("reveals advanced tools without editing content or resetting selection and undo history", async () => {
    const editor = await openTask(existingTodo);
    await act(async () => editor.commands.setTextSelection(5));
    await click("More formatting");
    expect(document.querySelector('[aria-label="Less formatting"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[aria-label="Text style"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Insert table"]')).not.toBeNull();
    expect(editor.state.selection.from).toBe(5);
    expect(document.body.textContent).not.toContain("Unsaved changes");
    await act(async () => editor.commands.insertContent("New "));
    const content = editor.getHTML();
    const selection = editor.state.selection.from;
    await click("Less formatting");
    expect(document.querySelector('[aria-label="More formatting"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[aria-label="Insert table"]')).toBeNull();
    expect((document.querySelector(".tiptap") as HTMLElement & { editor: Editor }).editor).toBe(editor);
    expect(editor.getHTML()).toBe(content);
    expect(editor.state.selection.from).toBe(selection);
    await click("Undo");
    expect(editor.getHTML()).toBe(existingTodo.content);
    await click("Redo");
    expect(editor.getHTML()).toBe(content);
  });

  it("keeps existing rich content and due dates when saved through the compact editor", async () => {
    const content = '<h2>Research</h2><blockquote><p>A useful quote</p></blockquote><p><mark>Remember</mark> <a href="https://example.com">Source</a></p><table><tbody><tr><td><p>Existing cell</p></td></tr></tbody></table><ul data-checklist="true"><li><input type="checkbox" checked>Ready</li></ul>';
    await openTask({ ...existingTodo, content });
    expect(document.querySelector('[aria-label="Text style"]')).toBeNull();
    await submit();
    const saved = mocks.updateTodo.mock.calls[0][0];
    expect(saved.dueDate).toBe(existingTodo.due_date);
    expect(saved.content).toContain("<h2>Research</h2>");
    expect(saved.content).toContain("<blockquote>");
    expect(saved.content).toContain("<mark>Remember</mark>");
    expect(saved.content).toContain('href="https://example.com"');
    expect(saved.content).toContain("<table>");
    expect(saved.content).toContain('checked=""');
  });

  it("preserves supported pasted formatting in compact mode and removes executable markup", async () => {
    await openTask();
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: {
        files: [],
        getData: (type: string) => type === "text/html"
          ? '<h3>Next steps</h3><p><strong>Keep</strong> <em>this</em> <a href="https://example.com">link</a><img src="https://tracker.example/pixel"><script>bad()</script></p><table><tr><td>Context</td></tr></table>'
          : "",
      },
    });
    await act(async () => document.querySelector(".tiptap")!.dispatchEvent(paste));
    await submit();
    const content = mocks.createTodo.mock.calls[0][0].content;
    expect(content).toContain("<h3>Next steps</h3>");
    expect(content).toContain("<strong>Keep</strong>");
    expect(content).toContain("<em>this</em>");
    expect(content).toContain('href="https://example.com"');
    expect(content).toContain("<table>");
    expect(content).not.toMatch(/script|tracker|<img/);
  });

  it("applies compact formatting and validates links without submitting the task", async () => {
    const editor = await openTask();
    await act(async () => {
      editor.commands.setContent("<p>Useful context</p>");
      editor.commands.setTextSelection({ from: 1, to: 7 });
    });
    await click("Bold");
    await click("Italic");
    expect(editor.getHTML()).toContain("<strong><em>Useful</em></strong>");
    await click("Link");
    const input = document.querySelector<HTMLInputElement>(".entry-link-panel input")!;
    expect(document.querySelector<HTMLLabelElement>(".entry-link-panel label")?.htmlFor).toBe(input.id);
    const apply = [...document.querySelectorAll<HTMLButtonElement>(".entry-link-panel button")].find((button) => button.textContent === "Apply")!;
    await act(async () => setInputValue(input, "javascript:alert(1)"));
    await act(async () => apply.click());
    expect(document.querySelector('.entry-link-panel [role="alert"]')?.textContent).toContain("Use a complete");
    expect(editor.getHTML()).not.toContain("javascript:");
    await act(async () => setInputValue(input, "https://example.com/context"));
    await act(async () => apply.click());
    expect(editor.getHTML()).toContain('href="https://example.com/context"');
    expect(mocks.createTodo).not.toHaveBeenCalled();
  });

  it("keeps compact toolbar state and content across Focus and width changes", async () => {
    const editor = await openTask(existingTodo);
    await click("Use full width");
    await click("Enter focus mode");
    expect(document.querySelector(".entry-composer")?.getAttribute("data-focused")).toBe("true");
    expect(document.querySelector('.entry-composer[data-variant="compact"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Text style"]')).toBeNull();
    await click("More formatting");
    await click("Exit focus mode");
    await click("Use comfortable width");
    expect(document.querySelector(".entry-composer")?.hasAttribute("data-focused")).toBe(false);
    expect(document.querySelector('[aria-label="Less formatting"]')).not.toBeNull();
    expect(editor.getHTML()).toBe(existingTodo.content);
    expect(mocks.updateTodo).not.toHaveBeenCalled();
  });

  it("creates an untitled todo with empty details", async () => {
    await act(async () => {
      root.render(<TodoEditorDialog open todo={null} onClose={() => {}} />);
    });
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(mocks.createTodo).toHaveBeenCalledWith({
      title: "encrypted:Untitled task",
      content: "encrypted:",
      folderId: null,
      dueDate: null,
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
  });

  it("supports checkbox lists in todo details", async () => {
    await act(async () => {
      root.render(<TodoEditorDialog open todo={null} onClose={() => {}} />);
    });

    const editor = document.querySelector<HTMLDivElement>(
      '[aria-label="Task details"]',
    )!;
    await act(async () => {
      const tiptap = (editor as HTMLDivElement & { editor: Editor }).editor;
      tiptap.commands.setContent("<ul><li><p>Pack charger</p></li></ul>");
      tiptap.commands.setTextSelection(3);
    });

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Checkbox list"]')!
        .click();
    });

    expect(editor.querySelector("ul")?.getAttribute("data-checklist")).toBe(
      "true",
    );
    expect(editor.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it("saves a due date with a new todo", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<TodoEditorDialog open todo={null} onClose={onClose} />);
    });

    const title = document.querySelector<HTMLInputElement>("#todo-title")!;
    const dueDate = document.querySelector<HTMLInputElement>("#todo-due-date")!;
    await act(async () => {
      setInputValue(title, "Ship the release");
      setInputValue(dueDate, "2026-08-12");
    });
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(mocks.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-08-12" }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Unsaved changes");
    await act(async () => setInputValue(dueDate, "2026-08-13"));
    expect(document.body.textContent).toContain("Unsaved changes");
    await act(async () =>
      document.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(mocks.createTodo).toHaveBeenCalledOnce();
    expect(mocks.updateTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        todoId: "created-todo-1", dueDate: "2026-08-13",
      }),
    );
  });

  it("prevents creating a todo after the plan limit is reached", async () => {
    mocks.entryCount = 100;
    mocks.accountPlan = { limits: { entries: 100, tags: 100 } };
    await act(async () => {
      root.render(<TodoEditorDialog open todo={null} onClose={() => {}} />);
    });
    const title = document.querySelector<HTMLInputElement>("#todo-title")!;
    await act(async () => setInputValue(title, "One too many"));
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(document.body.textContent).toContain(
      "Entry limit reached. You can have at most 100 documents and tasks combined.",
    );
    expect(mocks.createTodo).not.toHaveBeenCalled();
  });
});
