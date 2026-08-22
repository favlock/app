import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodoEditorDialog from "./TodoEditorDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
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
    mocks.createTodo.mockReset().mockResolvedValue(undefined);
    mocks.updateTodo.mockReset().mockResolvedValue(undefined);
    mocks.encryptField.mockClear();
    mocks.entryCount = 0;
    mocks.accountPlan = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
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

  it("creates an untitled todo with empty details", async () => {
    await act(async () => {
      root.render(<TodoEditorDialog open todo={null} onClose={() => {}} />);
    });
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(
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

    expect(editor.querySelector("ul")?.getAttribute("data-checklist")).toBe(
      "true",
    );
    expect(editor.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it("saves a due date with a new todo", async () => {
    await act(async () => {
      root.render(<TodoEditorDialog open todo={null} onClose={() => {}} />);
    });

    const title = document.querySelector<HTMLInputElement>("#todo-title")!;
    const dueDate =
      document.querySelector<HTMLInputElement>("#todo-due-date")!;
    await act(async () => {
      setInputValue(title, "Ship the release");
      setInputValue(dueDate, "2026-08-12");
    });
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(mocks.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-08-12" }),
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
      document.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(document.body.textContent).toContain(
      "Entry limit reached. You can have at most 100 notes and tasks combined.",
    );
    expect(mocks.createTodo).not.toHaveBeenCalled();
  });
});
