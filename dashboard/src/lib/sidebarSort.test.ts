import { afterEach, describe, expect, it } from "vitest";
import type { Folder, Tag } from "../types/bookmark";
import {
  SIDEBAR_SORT_STORAGE_KEYS,
  buildTagPlacements,
  getSidebarSortMode,
  parseSidebarSortMode,
  placeTag,
  setSidebarSortMode,
  sortSidebarFolders,
  sortSidebarTags,
} from "./sidebarSort";

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

const tag = (id: string, name: string, sortOrder?: number): Tag => ({
  id,
  user_id: "user-1",
  name,
  ...(sortOrder === undefined ? {} : { sort_order: sortOrder }),
  created_at: "2026-01-01T00:00:00.000Z",
});

const ids = (items: Array<{ id: string }>) => items.map(({ id }) => id);

describe("sidebar sorting", () => {
  const folders = [
    folder("design", "Design", 0),
    folder("type", "Typography", 0, "design"),
    folder("color", "Color", 1, "design"),
    folder("apps", "apps", 1),
    folder("work", "Work", 2),
  ];
  const counts = { design: 2, type: 1, color: 4, apps: 9, work: 2 };

  it("keeps the saved hierarchy order in custom mode", () => {
    expect(ids(sortSidebarFolders(folders, "custom", counts))).toEqual([
      "design",
      "type",
      "color",
      "apps",
      "work",
    ]);
  });

  it("sorts collections and their subcollections by name", () => {
    expect(ids(sortSidebarFolders(folders, "name", counts))).toEqual([
      "apps",
      "design",
      "color",
      "type",
      "work",
    ]);
  });

  it("sorts by count with name as the tie-breaker", () => {
    expect(ids(sortSidebarFolders(folders, "count", counts))).toEqual([
      "apps",
      "design",
      "color",
      "type",
      "work",
    ]);
  });

  it("sorts tags by name, count, or custom position", () => {
    const tags = [tag("b", "beta", 0), tag("a", "Alpha", 2), tag("c", "item 10", 1), tag("d", "item 9")];

    expect(ids(sortSidebarTags(tags, "name", {}))).toEqual(["a", "b", "d", "c"]);
    expect(ids(sortSidebarTags(tags, "count", { c: 3, a: 3, b: 1 }))).toEqual([
      "a",
      "c",
      "b",
      "d",
    ]);
    expect(ids(sortSidebarTags(tags, "custom", {}))).toEqual(["b", "d", "c", "a"]);
  });

  it("moves a tag and renumbers every position", () => {
    const tags = [tag("a", "Alpha"), tag("b", "Beta"), tag("c", "Gamma")];
    const moved = placeTag(tags, "c", 0);

    expect(ids(moved)).toEqual(["c", "a", "b"]);
    expect(buildTagPlacements(moved)).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });
});

describe("sidebar sort preference", () => {
  afterEach(() => {
    localStorage.clear();
    setSidebarSortMode("collections", "custom");
    setSidebarSortMode("tags", "name");
  });

  it("defaults to the previous fixed order of each section", () => {
    expect(parseSidebarSortMode("collections", null)).toBe("custom");
    expect(parseSidebarSortMode("tags", "unknown")).toBe("name");
  });

  it("stores each section independently", () => {
    setSidebarSortMode("tags", "count");

    expect(getSidebarSortMode("tags")).toBe("count");
    expect(getSidebarSortMode("collections")).toBe("custom");
    expect(localStorage.getItem(SIDEBAR_SORT_STORAGE_KEYS.tags)).toBe("count");
  });
});
