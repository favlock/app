import { describe, expect, it } from "vitest";
import type { BookmarkList, ListItem } from "../types/bookmark";
import {
  getBookmarkListIds,
  getListProgress,
  hasReachedListLimit,
  moveListItem,
} from "./lists";

const item = (id: string, completed: boolean): ListItem => ({
  bookmark: {
    id,
    user_id: "user",
    title: id,
    url: `https://example.com/${id}`,
    created_at: "2026-08-17T00:00:00.000Z",
  },
  position: 0,
  completed_at: completed ? "2026-08-17T01:00:00.000Z" : null,
  created_at: "2026-08-17T00:00:00.000Z",
});

describe("Lists", () => {
  it("calculates completion progress", () => {
    expect(getListProgress([item("one", true), item("two", false)])).toEqual({
      completed: 1,
      total: 2,
      percentage: 50,
    });
    expect(getListProgress([])).toEqual({
      completed: 0,
      total: 0,
      percentage: 0,
    });
  });

  it("moves list items without mutating the input", () => {
    const ids = ["one", "two", "three"];
    expect(moveListItem(ids, "two", "up")).toEqual(["two", "one", "three"]);
    expect(moveListItem(ids, "three", "down")).toBe(ids);
    expect(ids).toEqual(["one", "two", "three"]);
  });

  it("finds every List containing a bookmark", () => {
    const lists = [
      {
        id: "watch",
        items: [{ bookmark: { id: "bookmark-1" } }],
      },
      {
        id: "read",
        items: [{ bookmark: { id: "bookmark-2" } }],
      },
      {
        id: "weekend",
        items: [{ bookmark: { id: "bookmark-1" } }],
      },
    ] as BookmarkList[];

    expect(getBookmarkListIds(lists, "bookmark-1")).toEqual([
      "watch",
      "weekend",
    ]);
  });

  it("treats zero as unlimited and finite allowances as creation limits", () => {
    expect(hasReachedListLimit(3, 3)).toBe(true);
    expect(hasReachedListLimit(4, 3)).toBe(true);
    expect(hasReachedListLimit(2, 3)).toBe(false);
    expect(hasReachedListLimit(100, 0)).toBe(false);
  });
});
