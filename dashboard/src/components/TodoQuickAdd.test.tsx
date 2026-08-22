import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodoQuickAdd from "./TodoQuickAdd";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createTodo: vi.fn(),
  encryptField: vi.fn(async (value: string) => `encrypted:${value}`),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({ encryptField: mocks.encryptField }),
}));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({ data: undefined }),
}));
vi.mock("../hooks/useEntriesQuery", () => ({
  useEntryCount: () => ({ data: 0 }),
}));
vi.mock("../hooks/useTodosQuery", () => ({
  useCreateTodo: () => ({
    mutateAsync: mocks.createTodo,
    isPending: false,
  }),
}));

describe("TodoQuickAdd", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.createTodo.mockReset().mockResolvedValue("todo-1");
    mocks.encryptField.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("creates a todo without a due date unless one is explicitly chosen", async () => {
    await act(async () => root.render(<TodoQuickAdd />));

    expect(container.querySelector('input[type="date"]')).toBeNull();

    const title = container.querySelector<HTMLInputElement>(
      'input[aria-label="Task title"]',
    )!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(title, "Review release notes");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(mocks.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: null }),
    );
  });
});
