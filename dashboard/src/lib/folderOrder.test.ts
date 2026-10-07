import { describe, expect, it } from "vitest";
import {
  applyFolderPlacements,
  buildFolderPlacements,
  folderSiblings,
  nestTargets,
  placeFolder,
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
    const moved = placeFolder(folders, "b", "a", Number.MAX_SAFE_INTEGER);

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
    const moved = placeFolder(folders, "child", null, 1);

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

  it("moves a collection within its siblings and keeps children attached", () => {
    const folders = [
      folder("a", "Alpha", 0),
      folder("child", "Child", 0, "a"),
      folder("b", "Bravo", 1),
      folder("c", "Charlie", 2),
    ];

    const moved = placeFolder(folders, "a", null, 2);

    expect(moved.map(({ id }) => id)).toEqual(["b", "c", "a", "child"]);
    expect(buildFolderPlacements(moved)).toEqual([
      { id: "b", parentId: null, sortOrder: 0 },
      { id: "c", parentId: null, sortOrder: 1 },
      { id: "a", parentId: null, sortOrder: 2 },
      { id: "child", parentId: "a", sortOrder: 0 },
    ]);
  });

  it("clamps out-of-range positions", () => {
    const folders = [folder("a", "Alpha", 0), folder("b", "Bravo", 1)];

    expect(placeFolder(folders, "b", null, -5).map(({ id }) => id)).toEqual([
      "b",
      "a",
    ]);
    expect(placeFolder(folders, "a", null, 99).map(({ id }) => id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("renumbers the sibling group a subcollection leaves", () => {
    const folders = [
      folder("a", "Alpha", 0),
      folder("one", "One", 0, "a"),
      folder("two", "Two", 1, "a"),
      folder("b", "Bravo", 1),
    ];

    const moved = placeFolder(folders, "one", "b", 0);

    expect(folderSiblings(moved, "two").map(({ id }) => id)).toEqual(["two"]);
    expect(moved.find(({ id }) => id === "two")?.sort_order).toBe(0);
    expect(moved.find(({ id }) => id === "one")?.parent_id).toBe("b");
  });

  it("rejects nesting deeper than one level", () => {
    const folders = [
      folder("a", "Alpha", 0),
      folder("child", "Child", 0, "a"),
      folder("b", "Bravo", 1),
    ];

    expect(placeFolder(folders, "a", "b", 0)).toEqual(sortFolders(folders));
    expect(placeFolder(folders, "b", "child", 0)).toEqual(sortFolders(folders));
    expect(placeFolder(folders, "b", "b", 0)).toEqual(sortFolders(folders));
  });

  it("offers only other top-level collections as nest targets", () => {
    const folders = [
      folder("a", "Alpha", 0),
      folder("child", "Child", 0, "a"),
      folder("b", "Bravo", 1),
      folder("c", "Charlie", 2),
    ];

    expect(nestTargets(folders, "a")).toEqual([]);
    expect(nestTargets(folders, "b").map(({ id }) => id)).toEqual(["a", "c"]);
    expect(nestTargets(folders, "child").map(({ id }) => id)).toEqual([
      "b",
      "c",
    ]);
  });
});
