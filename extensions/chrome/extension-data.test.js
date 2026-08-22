import { describe, expect, it } from "vitest";
import {
  getBookmarkOrganization,
  getListCreationErrorMessage,
  normalizeOpenTabs,
  normalizeBookmarkUrl,
  normalizeSessionTagName,
  normalizeTagNames,
} from "./extension-data.js";

describe("extension quick-add data", () => {
  it("reads and deduplicates a bookmark's saved organization", () => {
    expect(
      getBookmarkOrganization({
        folders: [{ id: "folder-1" }],
        tags: [
          { id: "tag-1" },
          { id: "tag-1" },
          { id: "tag-2" },
        ],
        listIds: ["list-1", "list-2", "list-1"],
      }),
    ).toEqual({
      folderId: "folder-1",
      tagIds: ["tag-1", "tag-2"],
      listIds: ["list-1", "list-2"],
    });
  });

  it("normalizes, deduplicates, and caps new tag names", () => {
    expect(
      normalizeTagNames([
        "#Research, Design",
        "research",
        "one,two,three,four,five,six,seven,eight,nine,ten,eleven",
      ]),
    ).toEqual([
      "research",
      "design",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
    ]);
  });

  it("keeps unique web tabs and excludes the FavLock dashboard", () => {
    expect(
      normalizeOpenTabs(
        [
          { title: "First", url: "https://example.com" },
          { title: "Duplicate", url: "https://example.com/" },
          { title: "Settings", url: "chrome://settings" },
          { title: "FavLock", url: "https://vault.favlock.app/settings" },
          { title: "Second", url: "http://example.org/path" },
        ],
        "https://vault.favlock.app/",
      ),
    ).toEqual([
      { title: "First", url: "https://example.com/" },
      { title: "Second", url: "http://example.org/path" },
    ]);
  });

  it("keeps a localized session label as one tag", () => {
    expect(normalizeSessionTagName("#Tabs — Aug 17, 14:30")).toBe(
      "tabs — aug 17, 14:30",
    );
  });

  it("canonicalizes YouTube watch, short, and shared URLs", () => {
    const expected = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(
      normalizeBookmarkUrl(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=test",
      ),
    ).toBe(expected);
    expect(normalizeBookmarkUrl("https://youtu.be/dQw4w9WgXcQ?t=30")).toBe(
      expected,
    );
    expect(
      normalizeBookmarkUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toBe(expected);
  });

  it("explains the Free List allowance when creation reaches the limit", () => {
    expect(
      getListCreationErrorMessage(
        new Error(
          "List limit reached. You can have at most 3 Lists on the free plan.",
        ),
      ),
    ).toBe("Free includes up to 3 Lists. Upgrade to Pro for unlimited Lists.");
  });
});
