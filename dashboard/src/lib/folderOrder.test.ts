import { describe, expect, it } from "vitest";
import {
  applyFolderPlacements,
  buildFolderPlacements,
  moveFolder,
  resolveFolderDragIntent,
  sortFolders,
} from "./folderOrder";
import type { Folder } from "../types/bookmark";

const folder = (
  id: string,
  name: string,
  sortOrder: number,
  parentId: string | null = null,
): Folder => ({
  id,
  user_id: "user-1",
  name,
  color: null,
  parent_id: parentId,
  sort_order: sortOrder,
  created_at: "2026-01-01T00:00:00.000Z",
});

describe("folder ordering", () => {
  it("places each root's sorted children immediately after it", () => {
    const folders = [
      folder("child-b", "Child B", 1, "root-a"),
      folder("root-b", "Root B", 1),
      folder("child-a", "Child A", 0, "root-a"),
      folder("root-a", "Root A", 0),
    ];

    expect(sortFolders(folders).map(({ id }) => id)).toEqual([
      "root-a",
      "child-a",
      "child-b",
      "root-b",
    ]);
  });

  it("uses the name as a stable fallback within the same sibling order", () => {
    const folders = [folder("b", "Bravo", 0), folder("a", "Alpha", 0)];

    expect(sortFolders(folders).map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("nests a root collection under another root", () => {
    const folders = [folder("a", "Alpha", 0), folder("b", "Bravo", 1)];
    const moved = moveFolder(folders, "b", "a", "a");

    expect(moved.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(moved.find(({ id }) => id === "b")?.parent_id).toBe("a");
    expect(buildFolderPlacements(moved)).toEqual([
      { id: "a", parentId: null, sortOrder: 0 },
      { id: "b", parentId: "a", sortOrder: 0 },
    ]);
  });

  it("moves a child back to the root level", () => {
    const folders = [
      folder("a", "Alpha", 0),
      folder("child", "Child", 0, "a"),
      folder("b", "Bravo", 1),
    ];
    const moved = moveFolder(folders, "child", "b", null);

    expect(moved.map(({ id }) => id)).toEqual(["a", "child", "b"]);
    expect(moved.find(({ id }) => id === "child")?.parent_id).toBeNull();
  });

  it("applies parent-aware optimistic placements", () => {
    const folders = [folder("a", "Alpha", 0), folder("b", "Bravo", 1)];
    const reordered = applyFolderPlacements(folders, [
      { id: "b", parentId: null, sortOrder: 0 },
      { id: "a", parentId: "b", sortOrder: 0 },
    ]);

    expect(reordered.map(({ id }) => id)).toEqual(["b", "a"]);
    expect(reordered[1].parent_id).toBe("b");
  });

  it("previews nesting under the root of the hovered branch", () => {
    const folders = [
      folder("a", "Alpha", 0),
      folder("child", "Child", 0, "a"),
      folder("b", "Bravo", 1),
    ];

    expect(
      resolveFolderDragIntent(folders, "b", "child", 30, 30),
    ).toEqual(
      expect.objectContaining({
        action: "nest",
        nextParentId: "a",
        targetParentId: "a",
      }),
    );
  });

  it("previews moving a child to the top level even while over itself", () => {
    const folders = [
      folder("a", "Alpha", 0),
      folder("child", "Child", 0, "a"),
    ];

    expect(
      resolveFolderDragIntent(folders, "child", "child", -30, 30),
    ).toEqual(
      expect.objectContaining({
        action: "unnest",
        nextParentId: null,
        overId: "a",
      }),
    );
  });

  it("blocks nesting a collection that already has children", () => {
    const folders = [
      folder("a", "Alpha", 0),
      folder("child", "Child", 0, "a"),
      folder("b", "Bravo", 1),
    ];

    expect(
      resolveFolderDragIntent(folders, "a", "b", 30, 30)?.action,
    ).toBe("blocked");

    expect(resolveFolderDragIntent(folders, "b", "a", 29, 30)?.action).toBe(
      "reorder",
    );
  });
});
