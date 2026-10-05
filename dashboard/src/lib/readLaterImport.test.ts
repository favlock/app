import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  parseBookmarkImportFile,
  parseBrowserBookmarksHtml,
} from "./browserBookmarkImport";
import {
  fingerprintBrowserBookmarkImport,
  prepareBrowserBookmarkImport,
} from "./browserBookmarkImportPlan";
import { detectReadLaterCsv, parseCsv, parseReadLaterCsv } from "./readLaterImport";

function createImportFile(
  name: string,
  contents: string | Uint8Array,
  type = "",
) {
  const bytes =
    typeof contents === "string" ? new TextEncoder().encode(contents) : contents;

  return {
    name,
    size: bytes.byteLength,
    type,
    async arrayBuffer() {
      return bytes.slice().buffer as ArrayBuffer;
    },
    async text() {
      return new TextDecoder().decode(bytes);
    },
  };
}

const POCKET_CSV = [
  "title,url,time_added,tags,status",
  "Example article,https://example.com/article,1700000000,reading|news,unread",
  '"Quoted, title",https://example.org/archived,1700000001,,archive',
].join("\n");

const RAINDROP_CSV = [
  "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite",
  '1,Design notes,"multi\nline note",Excerpt,https://example.com/design,Work/Design,"ui, ux",2024-01-01T00:00:00.000Z,,,false',
  "2,Loose link,,,https://example.net,Unsorted,,2024-01-02T00:00:00.000Z,,,false",
  "3,Recipes,,,https://example.org/recipes,Home,,2024-01-03T00:00:00.000Z,,,true",
].join("\r\n");

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, embedded newlines, CRLF, and BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""","line\nbreak"\r\n\r\n')).toEqual([
      ["a", "b"],
      ['x, "y"', "line\nbreak"],
    ]);
  });

  it("rejects an unterminated quoted value", () => {
    expect(() => parseCsv('a,b\n"open,1')).toThrow("quoted value");
  });

  it("rejects exports above the row limit", () => {
    expect(() => parseCsv("url\nhttps://a.example\nhttps://b.example", 2)).toThrow(
      "too many records",
    );
  });

  it("detects Pocket and Raindrop headers only", () => {
    expect(detectReadLaterCsv(["title", "url", "time_added", "tags", "status"])).toBe("pocket");
    expect(detectReadLaterCsv(["id", "title", "note", "excerpt", "url", "folder"])).toBe("raindrop");
    expect(detectReadLaterCsv(["name", "email"])).toBeNull();
    expect(detectReadLaterCsv(["title", "url"])).toBeNull();
  });
});

describe("Pocket import", () => {
  it("maps unread items to Pocket and archived items to Pocket › Archive", () => {
    expect(parseReadLaterCsv([POCKET_CSV])).toEqual({
      source: "pocket",
      result: {
        bookmarks: [
          { title: "Example article", url: "https://example.com/article", folderPath: ["Pocket"], tags: ["reading", "news"] },
          { title: "Quoted, title", url: "https://example.org/archived", folderPath: ["Pocket", "Archive"] },
        ],
        folderPaths: [["Pocket"], ["Pocket", "Archive"]],
      },
    });
  });

  it("reads every CSV part from a Pocket ZIP export", async () => {
    const archive = zipSync({
      "part_000000.csv": strToU8(POCKET_CSV),
      "part_000001.csv": strToU8(
        "title,url,time_added,cursor,tags,status\nLater,https://example.com/later,1700000002,abc,,unread",
      ),
      "annotations/part_000000.json": strToU8("[]"),
    });
    const parsed = await parseBookmarkImportFile(
      createImportFile("pocket.zip", archive, "application/zip"),
    );

    expect(parsed.source).toBe("pocket");
    expect(parsed.result.bookmarks.map((bookmark) => bookmark.url)).toEqual([
      "https://example.com/article",
      "https://example.org/archived",
      "https://example.com/later",
    ]);
  });

  it("parses Pocket's legacy HTML export sections", () => {
    const html = `<!DOCTYPE html><html><head><title>Pocket Export</title></head><body>
      <h1>Unread</h1>
      <ul><li><a href="https://example.com/unread" time_added="1" tags="a">Unread item</a></li></ul>
      <h1>Read Archive</h1>
      <ul><li><a href="https://example.com/read" time_added="2" tags="">Read item</a></li></ul>
    </body></html>`;

    expect(parseBrowserBookmarksHtml(html)).toEqual({
      bookmarks: [
        { title: "Unread item", url: "https://example.com/unread", folderPath: ["Pocket"], tags: ["a"] },
        { title: "Read item", url: "https://example.com/read", folderPath: ["Pocket", "Archive"] },
      ],
      folderPaths: [["Pocket"], ["Pocket", "Archive"]],
    });
  });

  it("does not treat Netscape bookmark files as Pocket exports", () => {
    const result = parseBrowserBookmarksHtml(
      "<h1>Unread</h1><DL><DT><H3>Folder</H3></DT><DL><DT><A HREF=\"https://example.com\">X</A></DT></DL></DL>",
    );
    expect(result.bookmarks[0].folderPath).toEqual(["Folder"]);
  });
});

describe("Raindrop.io import", () => {
  it("maps Raindrop folders to collections and Unsorted to no collection", async () => {
    const parsed = await parseBookmarkImportFile(
      createImportFile("export.csv", RAINDROP_CSV, "text/csv"),
    );

    expect(parsed).toEqual({
      source: "raindrop",
      result: {
        bookmarks: [
          { title: "Design notes", url: "https://example.com/design", folderPath: ["Work", "Design"], tags: ["ui", "ux"] },
          { title: "Loose link", url: "https://example.net", folderPath: [] },
          { title: "Recipes", url: "https://example.org/recipes", folderPath: ["Home"] },
        ],
        folderPaths: [["Work", "Design"], ["Home"]],
      },
    });
  });

  it("previews Raindrop records through the shared import plan", async () => {
    const parsed = await parseBookmarkImportFile(
      createImportFile("export.csv", RAINDROP_CSV, "text/csv"),
    );
    const preview = await prepareBrowserBookmarkImport(
      parsed.result,
      [],
      [],
      [],
      { limits: { bookmarks: 0, collections: 0, tags: 0, notes: 0, lists: 0, tasks: 0 } } as never,
      { bookmarks: 0, collections: 0 },
    );

    expect(preview.readyToAddCount).toBe(3);
    expect(preview.newFolderPaths).toEqual([["Work"], ["Home"], ["Work", "Design"]]);
  });

  it("rejects unsafe URLs as invalid records", async () => {
    const parsed = await parseBookmarkImportFile(
      createImportFile(
        "export.csv",
        "id,title,note,excerpt,url,folder\n1,Bad,,,javascript:alert(1),Work",
        "text/csv",
      ),
    );
    const preview = await prepareBrowserBookmarkImport(
      parsed.result,
      [],
      [],
      [],
      { limits: { bookmarks: 0, collections: 0 } } as never,
      { bookmarks: 0, collections: 0 },
    );

    expect(preview.invalidCount).toBe(1);
    expect(preview.validCount).toBe(0);
  });
});

describe("imported tags", () => {
  it("reads TAGS attributes from Netscape HTML exports such as Raindrop.io", () => {
    const result = parseBrowserBookmarksHtml(
      '<DL><DT><H3>Work</H3></DT><DL><DT><A HREF="https://example.com" TAGS="Design, research">X</A></DT></DL></DL>',
    );
    expect(result.bookmarks[0].tags).toEqual(["Design", "research"]);
  });

  it("normalizes, deduplicates, and caps tags per bookmark", async () => {
    const preview = await prepareBrowserBookmarkImport(
      {
        bookmarks: [
          {
            title: "Many",
            url: "https://example.com/many",
            folderPath: [],
            tags: ["#Read", "read", " READ ", ...Array.from({ length: 12 }, (_, index) => `t${index}`), "x".repeat(201)],
          },
          { title: "Existing", url: "https://example.com/existing", folderPath: [], tags: ["Work"] },
        ],
        folderPaths: [],
      },
      [],
      [],
      [{ id: "tag-1", user_id: "user-1", name: "work", created_at: "2026-01-01T00:00:00.000Z" }],
      { limits: { bookmarks: 0, collections: 0, tags: 0 } } as never,
      { bookmarks: 0, collections: 0 },
    );

    expect(preview.items[0].tags).toEqual(["read", ...Array.from({ length: 9 }, (_, index) => `t${index}`)]);
    expect(preview.skippedTagCount).toBe(4);
    expect(preview.taggedCount).toBe(2);
    expect(preview.newTagNames).not.toContain("work");
    expect(preview.newTagNames).toHaveLength(10);
  });

  it("blocks when new tags exceed a limited tag allowance", async () => {
    const preview = await prepareBrowserBookmarkImport(
      {
        bookmarks: [{ title: "A", url: "https://example.com", folderPath: [], tags: ["one", "two"] }],
        folderPaths: [],
      },
      [],
      [],
      [],
      { limits: { bookmarks: 0, collections: 0, tags: 1 } } as never,
      { bookmarks: 0, collections: 0, tags: 0 },
    );

    expect(preview.blockedReason).toContain("2 new tags");
  });

  it("keeps the source fingerprint stable for exports without tags", async () => {
    const untagged = { bookmarks: [{ title: "A", url: "https://a.test", folderPath: [] }], folderPaths: [] };
    const withEmptyTags = { bookmarks: [{ title: "A", url: "https://a.test", folderPath: [], tags: [] }], folderPaths: [] };
    expect(await fingerprintBrowserBookmarkImport(untagged)).toBe(
      await fingerprintBrowserBookmarkImport(withEmptyTags),
    );
  });
});

describe("CSV file selection", () => {
  it("rejects CSV files that are not read-later exports", async () => {
    await expect(
      parseBookmarkImportFile(createImportFile("contacts.csv", "name,email\nA,a@example.com", "text/csv")),
    ).rejects.toThrow("not a Pocket or Raindrop.io export");
  });

  it("rejects an oversized CSV before reading it", async () => {
    await expect(
      parseBookmarkImportFile({
        ...createImportFile("export.csv", "url", "text/csv"),
        size: 26 * 1024 * 1024,
      }),
    ).rejects.toThrow("too large");
  });

  it("still imports Safari ZIP exports", async () => {
    const parsed = await parseBookmarkImportFile(
      createImportFile(
        "Safari.zip",
        zipSync({ "Safari/Bookmarks.html": strToU8('<DL><DT><A HREF="https://example.com">X</A></DT></DL>') }),
        "application/zip",
      ),
    );
    expect(parsed.source).toBe("safari-zip");
  });
});
