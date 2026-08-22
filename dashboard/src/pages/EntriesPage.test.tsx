import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  type RouterProviderProps,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, Todo } from "../types/bookmark";
import EntriesPage from "./EntriesPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const note = (id: string, title: string): Note => ({
  kind: "note",
  id,
  user_id: "user-1",
  title,
  content: "",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
});

const todo = (
  id: string,
  title: string,
  isCompleted: boolean,
  dueDate: string | null = null,
): Todo => ({
  ...note(id, title),
  kind: "todo",
  is_completed: isCompleted,
  completed_at: isCompleted ? "2026-08-02T10:00:00.000Z" : null,
  due_date: dueDate,
});

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function TestLayout() {
  return (
    <Outlet
      context={{
        setIsMobileSidebarOpen: vi.fn(),
        openAddBookmark: vi.fn(),
      }}
    />
  );
}

function createTestRouter(
  page: ReactElement,
  initialEntry: string,
): RouterProviderProps["router"] {
  return createMemoryRouter(
    [
      {
        path: "/",
        element: <TestLayout />,
        children: [{ path: "*", element: page }],
      },
    ],
    { initialEntries: [initialEntry] },
  );
}

describe("EntriesPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("opens a deep-linked note and consumes the open parameter", async () => {
    const entries = [note("note-1", "First note"), note("note-2", "Target note")];
    const router = createTestRouter(
      <EntriesPage
        kind="note"
        entries={entries}
        fullTextSearchEnabled={false}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        renderCard={(entry) => <span>{entry.title}</span>}
        renderEditor={({ open, entry }) =>
          open ? <div data-testid="editor">Editing {entry?.title}</div> : null
        }
      />,
      "/notes?open=note-2",
    );

    await act(async () => root.render(<RouterProvider router={router} />));

    expect(document.querySelector('[data-testid="editor"]')?.textContent).toBe(
      "Editing Target note",
    );
    expect(router.state.location.search).toBe("");
  });

  it("applies and updates todo completion filters through the URL", async () => {
    const entries = [
      todo("todo-open", "Open task", false),
      todo("todo-done", "Done task", true),
    ];
    const router = createTestRouter(
      <EntriesPage
        kind="todo"
        entries={entries}
        fullTextSearchEnabled={false}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        isCompleted={(entry) => entry.is_completed}
        renderCard={(entry) => (
          <span data-testid={`card-${entry.id}`}>{entry.title}</span>
        )}
        renderEditor={() => null}
      />,
      "/tasks?filter=done",
    );

    await act(async () => root.render(<RouterProvider router={router} />));

    expect(container.querySelector('[data-testid="card-todo-open"]')).toBeNull();
    expect(container.querySelector('[data-testid="card-todo-done"]')).not.toBeNull();

    const openFilter = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Open 1",
    )!;
    await act(async () => openFilter.click());

    expect(router.state.location.search).toBe("");
    expect(container.querySelector('[data-testid="card-todo-open"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="card-todo-done"]')).toBeNull();
  });

  it("defaults to open todos, sorts by due date, and filters date views", async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const entries = [
      todo("no-date", "No date", false),
      todo("tomorrow", "Tomorrow", false, localDateString(tomorrow)),
      todo("done", "Already done", true, localDateString(today)),
      todo("overdue", "Overdue", false, localDateString(yesterday)),
      todo("today", "Today", false, localDateString(today)),
    ];
    const router = createTestRouter(
      <EntriesPage
        kind="todo"
        entries={entries}
        fullTextSearchEnabled={false}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        isCompleted={(entry) => entry.is_completed}
        getDueDate={(entry) => entry.due_date}
        renderCard={(entry) => (
          <span data-testid={`card-${entry.id}`}>{entry.title}</span>
        )}
        renderEditor={() => null}
      />,
      "/tasks",
    );

    await act(async () => root.render(<RouterProvider router={router} />));

    expect(
      [...container.querySelectorAll<HTMLElement>('[data-testid^="card-"]')].map(
        (card) => card.textContent,
      ),
    ).toEqual(["Overdue", "Today", "Tomorrow", "No date"]);

    const todayFilter = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Today 1")!;
    await act(async () => todayFilter.click());

    expect(router.state.location.search).toBe("?filter=today");
    expect(container.querySelector('[data-testid="card-today"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="card-overdue"]')).toBeNull();
  });

  it("opens collapsed task search with / but not Cmd+K", async () => {
    const router = createTestRouter(
      <EntriesPage
        kind="todo"
        entries={[todo("todo-1", "Plan launch", false)]}
        fullTextSearchEnabled={false}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        isCompleted={(entry) => entry.is_completed}
        renderCard={(entry) => <span>{entry.title}</span>}
        renderEditor={() => null}
      />,
      "/tasks",
    );

    await act(async () => root.render(<RouterProvider router={router} />));

    expect(container.querySelector('input[type="search"]')).toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true }),
      );
    });
    expect(container.querySelector('input[type="search"]')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));
    });

    expect(container.querySelector('input[type="search"]')).not.toBeNull();
  });

  it("opens a blank editor from the shared create action", async () => {
    const router = createTestRouter(
      <EntriesPage
        kind="note"
        entries={[note("note-1", "Existing note")]}
        fullTextSearchEnabled={false}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        renderCard={(entry) => <span>{entry.title}</span>}
        renderEditor={({ open, entry }) =>
          open ? <div data-testid="editor">{entry ? entry.title : "New entry"}</div> : null
        }
      />,
      "/notes",
    );

    await act(async () => root.render(<RouterProvider router={router} />));
    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("New note"),
    )!;
    await act(async () => createButton.click());

    expect(document.querySelector('[data-testid="editor"]')?.textContent).toBe(
      "New entry",
    );
  });
});
