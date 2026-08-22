import { describe, expect, it } from "vitest";
import type { Todo } from "../types/bookmark";
import { searchTodos } from "./todoSearch";

function todo(overrides: Partial<Todo>): Todo {
  return {
    id: "todo-1",
    user_id: "user-1",
    title: "Untitled todo",
    content: "",
    is_completed: false,
    completed_at: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
    kind: "todo",
  };
}

describe("todo search", () => {
  it("searches title, details, category, and tags", () => {
    const todos = [
      todo({ id: "title", title: "Launch checklist" }),
      todo({ id: "details", content: "Prepare the launch checklist" }),
      todo({
        id: "metadata",
        folder: {
          id: "folder-1", user_id: "user-1", name: "Launch", color: null,
          parent_id: null, sort_order: 0, created_at: "2026-08-01T10:00:00.000Z",
        },
        tags: [{ id: "tag-1", user_id: "user-1", name: "checklist", created_at: "2026-08-01T10:00:00.000Z" }],
      }),
    ];

    expect(searchTodos(todos, "launch checklist").map(({ todo }) => todo.id))
      .toEqual(["title", "metadata", "details"]);
  });

  it("uses creation date when equally relevant todos match", () => {
    const todos = [
      todo({
        id: "older",
        title: "Plan launch",
        created_at: "2026-08-01T10:00:00.000Z",
        updated_at: "2026-08-04T10:00:00.000Z",
      }),
      todo({
        id: "newer",
        title: "Plan launch",
        created_at: "2026-08-03T10:00:00.000Z",
        updated_at: "2026-08-02T10:00:00.000Z",
        is_completed: true,
      }),
    ];

    expect(searchTodos(todos, "launch").map(({ todo }) => todo.id))
      .toEqual(["newer", "older"]);
  });

  it("excludes todo details when full-text search is disabled", () => {
    const todos = [
      todo({
        title: "Prepare release",
        content: "Confirm the lunar archive protocol",
        folder: {
          id: "folder-1",
          user_id: "user-1",
          name: "Launch",
          color: null,
          parent_id: null,
          sort_order: 0,
          created_at: "2026-08-01T10:00:00.000Z",
        },
      }),
    ];

    expect(
      searchTodos(todos, "lunar", { includeContent: false }),
    ).toHaveLength(0);
    expect(
      searchTodos(todos, "launch", { includeContent: false }),
    ).toHaveLength(1);
  });
});
