import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, Todo } from "../types/bookmark";
import EntryCard from "./EntryCard";

vi.mock("../hooks/useFoldersQuery", () => ({
  useFolders: () => ({
    data: [
      {
        id: "folder-1",
        user_id: "user-1",
        name: "Projects",
        color: "GREEN",
        parent_id: null,
        sort_order: 0,
        created_at: "2026-08-01T10:00:00.000Z",
      },
    ],
    isLoading: false,
  }),
}));

const entry: Note = {
  kind: "note",
  id: "entry-1",
  user_id: "user-1",
  title: "Plan launch",
  content: "<p>Prepare the final checklist.</p>",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
};

const todoEntry: Todo = {
  ...entry,
  kind: "todo",
  is_completed: false,
  completed_at: null,
};

describe("EntryCard", () => {
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

  it("shows creation metadata for notes without a completion action", async () => {
    await act(async () => {
      root.render(
        <EntryCard
          kind="note"
          entry={entry}
          onEdit={() => {}}
          onDelete={async () => {}}
          deletePending={false}
          onMove={async () => {}}
          movePending={false}
        />,
      );
    });

    expect(container.textContent).toContain("Created");
    expect(container.querySelector('[aria-label*="Mark Plan launch"]')).toBeNull();
  });

  it("renders sanitized rich-text formatting in the card preview", async () => {
    const formattedEntry: Note = {
      ...entry,
      content:
        "<p>Use <strong>bold</strong> and <em>emphasis</em>.</p>" +
        "<blockquote>Keep this quoted.</blockquote>" +
        "<ul><li>First item</li></ul>" +
        "<script>unsafe content</script>",
    };

    await act(async () => {
      root.render(
        <EntryCard
          kind="note"
          entry={formattedEntry}
          onEdit={() => {}}
          onDelete={async () => {}}
          deletePending={false}
          onMove={async () => {}}
          movePending={false}
        />,
      );
    });

    const preview = container.querySelector(".entry-card-preview")!;
    expect(preview.querySelector("strong")?.textContent).toBe("bold");
    expect(preview.querySelector("em")?.textContent).toBe("emphasis");
    expect(preview.querySelector("blockquote")?.textContent).toBe(
      "Keep this quoted.",
    );
    expect(preview.querySelector("li")?.textContent).toBe("First item");
    expect(preview.querySelector("script")).toBeNull();
    expect(preview.textContent).not.toContain("unsafe content");
  });

  it("keeps the todo completion control and passes the next state", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <EntryCard
          kind="todo"
          entry={todoEntry}
          onEdit={() => {}}
          onDelete={async () => {}}
          deletePending={false}
          onMove={async () => {}}
          movePending={false}
          onToggle={onToggle}
        />,
      );
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      '[aria-label="Mark Plan launch complete"]',
    )!;
    await act(async () => toggle.click());
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("opens a collection dropdown and moves the entry", async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <EntryCard
          kind="note"
          entry={entry}
          onEdit={() => {}}
          onDelete={async () => {}}
          deletePending={false}
          onMove={onMove}
          movePending={false}
        />,
      );
    });

    const category = container.querySelector<HTMLButtonElement>(
      '[aria-label="Change collection for Plan launch"]',
    )!;
    await act(async () => category.click());
    const project = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Projects",
    )!;
    await act(async () => project.click());
    expect(onMove).toHaveBeenCalledWith("folder-1");
  });

  it("confirms deletion through the shared dialog", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <EntryCard
          kind="note"
          entry={entry}
          onEdit={() => {}}
          onDelete={onDelete}
          deletePending={false}
          onMove={async () => {}}
          movePending={false}
        />,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Move Plan launch to Trash"]')!.click();
    });
    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Move to Trash",
    )!;
    await act(async () => confirm.click());
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
