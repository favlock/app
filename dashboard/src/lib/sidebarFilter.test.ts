import { describe, expect, it } from "vitest";
import {
  filterSidebarFolders,
  filterSidebarTags,
  hasSidebarQuery,
  limitSidebarItems,
  selectedFolderKeepIds,
} from "./sidebarFilter";
import type { Folder, Tag } from "../types/bookmark";

const folder = (
  id: string,
  name: string,
  parentId: string | null = null,
): Folder => ({
  id,
  user_id: "user-1",
  name,
  color: null,
  parent_id: parentId,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00.000Z",
});

const tag = (id: string, name: string): Tag => ({
  id,
  user_id: "user-1",
  name,
  created_at: "2026-01-01T00:00:00.000Z",
});

const folders = [
  folder("work", "Work"),
  folder("design", "Design systems", "work"),
  folder("hiring", "Hiring", "work"),
  folder("travel", "Travel"),
  folder("cafes", "Cafés", "travel"),
];

describe("hasSidebarQuery", () => {
  it("ignores whitespace-only input", () => {
    expect(hasSidebarQuery("   ")).toBe(false);
    expect(hasSidebarQuery(" a ")).toBe(true);
  });
});

describe("filterSidebarFolders", () => {
  it("returns every folder when the query is empty", () => {
    expect(filterSidebarFolders(folders, " ")).toEqual(
      folders.map((item) => ({ folder: item, isContext: false })),
    );
  });

  it("keeps the parent of a matching subcollection as context", () => {
    expect(filterSidebarFolders(folders, "design")).toEqual([
      { folder: folders[0], isContext: true },
      { folder: folders[1], isContext: false },
    ]);
  });

  it("shows a matching parent without its children", () => {
    expect(
      filterSidebarFolders(folders, "work").map((row) => row.folder.id),
    ).toEqual(["work"]);
  });

  it("does not mark a parent as context when it also matches", () => {
    expect(filterSidebarFolders(folders, "e")).toEqual([
      { folder: folders[0], isContext: true },
      { folder: folders[1], isContext: false },
      { folder: folders[3], isContext: false },
      { folder: folders[4], isContext: false },
    ]);
  });

  it("ignores case and accents and requires every term", () => {
    expect(
      filterSidebarFolders(folders, "CAFE").map((row) => row.folder.id),
    ).toEqual(["travel", "cafes"]);
    expect(
      filterSidebarFolders(folders, "sys des").map((row) => row.folder.id),
    ).toEqual(["work", "design"]);
    expect(filterSidebarFolders(folders, "design hiring")).toEqual([]);
  });
});

describe("filterSidebarTags", () => {
  const tags = [tag("a", "React"), tag("b", "Résumé"), tag("c", "Recipes")];

  it("returns every tag when the query is empty", () => {
    expect(filterSidebarTags(tags, "")).toBe(tags);
  });

  it("matches anywhere in the name, ignoring accents", () => {
    expect(filterSidebarTags(tags, "resu").map((item) => item.id)).toEqual([
      "b",
    ]);
    expect(filterSidebarTags(tags, "ec").map((item) => item.id)).toEqual([
      "c",
    ]);
  });
});

describe("limitSidebarItems", () => {
  const items = ["a", "b", "c", "d", "e"];
  const id = (item: string) => item;

  it("returns everything when within the limit", () => {
    expect(limitSidebarItems(items, id, 5)).toEqual({
      visible: items,
      hiddenCount: 0,
    });
  });

  it("cuts at the limit and counts the hidden items", () => {
    expect(limitSidebarItems(items, id, 2)).toEqual({
      visible: ["a", "b"],
      hiddenCount: 3,
    });
  });

  it("shows everything instead of hiding a single item", () => {
    expect(limitSidebarItems(items, id, 4)).toEqual({
      visible: items,
      hiddenCount: 0,
    });
    expect(limitSidebarItems(items, id, 4, new Set(["e"]))).toEqual({
      visible: items,
      hiddenCount: 0,
    });
  });

  it("gives requested items beyond the limit the last slots", () => {
    expect(limitSidebarItems(items, id, 3, new Set(["e"]))).toEqual({
      visible: ["a", "b", "e"],
      hiddenCount: 2,
    });
  });

  it("keeps a requested item near the limit when making room", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    expect(limitSidebarItems(many, id, 5, new Set(["e", "h"]))).toEqual({
      visible: ["a", "b", "c", "e", "h"],
      hiddenCount: 5,
    });
  });
});

describe("selectedFolderKeepIds", () => {
  it("includes the parent of a selected subcollection", () => {
    expect(selectedFolderKeepIds(folders, "cafes")).toEqual(
      new Set(["cafes", "travel"]),
    );
  });

  it("is empty for selections that are not collections", () => {
    expect(selectedFolderKeepIds(folders, "favorites")).toEqual(new Set());
    expect(selectedFolderKeepIds(folders, null)).toEqual(new Set());
  });
});
