import { describe, expect, it } from "vitest";
import { searchNotes } from "./noteSearch";
import type { Note } from "../types/bookmark";

function note(overrides: Partial<Note>): Note {
  return {
    id: "note-1",
    user_id: "user-1",
    title: "Untitled note",
    content: "<p>Empty</p>",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
    kind: "note",
  };
}

describe("note search", () => {
  it("searches titles and full rich-text bodies", () => {
    const notes = [
      note({ id: "title", title: "Launch checklist" }),
      note({
        id: "body",
        title: "Research",
        content: "<p>The launch checklist lives in this note.</p>",
      }),
    ];

    expect(searchNotes(notes, "launch checklist").map((match) => match.note.id)).toEqual([
      "title",
      "body",
    ]);
  });

  it("requires every search term to match", () => {
    const notes = [
      note({ title: "Project ideas", content: "<p>Summer reading list</p>" }),
      note({ id: "other", title: "Project ideas", content: "<p>Recipes</p>" }),
    ];

    expect(searchNotes(notes, "project reading").map((match) => match.note.id)).toEqual([
      "note-1",
    ]);
  });

  it("builds an excerpt around a body match", () => {
    const content = `<p>${"Background ".repeat(30)}needle appears here.</p>`;
    const [match] = searchNotes([note({ content })], "needle");

    expect(match.excerpt).toContain("needle appears here");
    expect(match.excerpt.startsWith("…")).toBe(true);
  });

  it("searches note categories and tags", () => {
    const notes = [
      note({
        folder: {
          id: "folder-1",
          user_id: "user-1",
          name: "Product",
          color: null,
          parent_id: null,
          sort_order: 0,
          created_at: "2026-08-01T10:00:00.000Z",
        },
        tags: [
          {
            id: "tag-1",
            user_id: "user-1",
            name: "roadmap",
            created_at: "2026-08-01T10:00:00.000Z",
          },
        ],
      }),
    ];

    expect(searchNotes(notes, "product")).toHaveLength(1);
    expect(searchNotes(notes, "roadmap")).toHaveLength(1);
  });

  it("excludes note bodies when full-text search is disabled", () => {
    const notes = [
      note({
        title: "Research",
        content: "<p>The lunar archive protocol</p>",
        tags: [
          {
            id: "tag-1",
            user_id: "user-1",
            name: "roadmap",
            created_at: "2026-08-01T10:00:00.000Z",
          },
        ],
      }),
    ];

    expect(
      searchNotes(notes, "lunar", { includeContent: false }),
    ).toHaveLength(0);
    expect(
      searchNotes(notes, "roadmap", { includeContent: false }),
    ).toHaveLength(1);
  });

  it("uses creation date when equally relevant notes match", () => {
    const notes = [
      note({
        id: "older",
        title: "Launch plan",
        created_at: "2026-08-01T10:00:00.000Z",
        updated_at: "2026-08-04T10:00:00.000Z",
      }),
      note({
        id: "newer",
        title: "Launch plan",
        created_at: "2026-08-03T10:00:00.000Z",
        updated_at: "2026-08-02T10:00:00.000Z",
      }),
    ];

    expect(searchNotes(notes, "launch").map((match) => match.note.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});
