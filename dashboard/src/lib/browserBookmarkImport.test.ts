import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  getExistingFolderIdByPath,
  getImportFolderPaths,
  getImportedBookmarkTitle,
  normalizeImportedBookmarkUrl,
  parseBrowserBookmarksFile,
  parseBrowserBookmarksHtml,
  parseChromeBookmarksTree,
  toSupportedFolderPath,
} from "./browserBookmarkImport";

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

describe("browser bookmark import", () => {
  it("parses nested browser bookmark exports with folder paths", () => {
    const html = `
      <DL>
        <DT><H3>Bookmarks Bar</H3></DT>
        <DL>
          <DT><A HREF="https://example.com">Example</A></DT>
          <DT><H3>Reading</H3></DT>
          <DL>
            <DT><A HREF="https://openai.com">OpenAI</A></DT>
          </DL>
        </DL>
      </DL>
    `;

    const result = parseBrowserBookmarksHtml(html);

    expect(result.bookmarks).toEqual([
      {
        title: "Example",
        url: "https://example.com",
        folderPath: ["Bookmarks Bar"],
      },
      {
        title: "OpenAI",
        url: "https://openai.com",
        folderPath: ["Bookmarks Bar", "Reading"],
      },
    ]);
    expect(result.folderPaths).toContainEqual(["Bookmarks Bar", "Reading"]);
  });

  it("reads an HTML bookmark export file", async () => {
    const file = createImportFile(
      "bookmarks.html",
      '<DL><DT><A HREF="https://example.com">Example</A></DT></DL>',
      "text/html",
    );

    await expect(parseBrowserBookmarksFile(file)).resolves.toMatchObject({
      bookmarks: [
        {
          title: "Example",
          url: "https://example.com",
        },
      ],
    });
  });

  it("rejects an oversized direct HTML export before reading it", async () => {
    const file = {
      ...createImportFile("bookmarks.html", "<DL></DL>", "text/html"),
      size: 25 * 1024 * 1024 + 1,
    };

    await expect(parseBrowserBookmarksFile(file)).rejects.toThrow(
      "The selected bookmark HTML file is too large to import safely.",
    );
  });

  it("extracts Safari bookmarks from a ZIP export", async () => {
    const archive = zipSync({
      "Safari/History.html": strToU8(
        '<A HREF="https://history.example">History entry</A>',
      ),
      "Safari/Bookmarks.html": strToU8(`
        <DL>
          <DT><H3>Favorites</H3></DT>
          <DL><DT><A HREF="https://example.com">Example</A></DT></DL>
        </DL>
      `),
    });
    const file = createImportFile("Safari.zip", archive, "application/zip");

    await expect(parseBrowserBookmarksFile(file)).resolves.toEqual({
      bookmarks: [
        {
          title: "Example",
          url: "https://example.com",
          folderPath: ["Favorites"],
        },
      ],
      folderPaths: [["Favorites"]],
    });
  });

  it("reports when a ZIP export does not contain bookmark HTML", async () => {
    const file = createImportFile(
      "Safari.zip",
      zipSync({ "Safari/History.json": strToU8("[]") }),
      "application/zip",
    );

    await expect(parseBrowserBookmarksFile(file)).rejects.toThrow(
      "No HTML bookmark export was found inside the selected ZIP file.",
    );
  });

  it("does not import Safari history when its bookmark file is empty", async () => {
    const file = createImportFile(
      "Safari.zip",
      zipSync({
        "Safari/Bookmarks.html": strToU8("<DL></DL>"),
        "Safari/History.html": strToU8(
          '<A HREF="https://history.example">History entry</A>',
        ),
      }),
      "application/zip",
    );

    await expect(parseBrowserBookmarksFile(file)).rejects.toThrow(
      "No bookmarks were found in the HTML export inside the ZIP file.",
    );
  });

  it("normalizes imported URLs and derives fallback titles", () => {
    expect(normalizeImportedBookmarkUrl("example.com/path")).toBe(
      "https://example.com/path",
    );
    expect(getImportedBookmarkTitle("", "https://example.com/path")).toBe(
      "example.com",
    );
    expect(getImportedBookmarkTitle("Folder > Final Title", "https://x.test"))
      .toBe("Final Title");
  });

  it("converts the Chrome bookmark tree and preserves empty folders", () => {
    expect(
      parseChromeBookmarksTree([
        {
          id: "0",
          title: "",
          children: [
            {
              id: "1",
              title: "Bookmarks bar",
              children: [
                { id: "2", title: "Example", url: "https://example.com" },
                {
                  id: "3",
                  title: "Reading",
                  children: [
                    { id: "4", title: "OpenAI", url: "https://openai.com" },
                  ],
                },
                { id: "5", title: "Empty folder", children: [] },
              ],
            },
          ],
        },
      ]),
    ).toEqual({
      bookmarks: [
        {
          title: "Example",
          url: "https://example.com",
          folderPath: ["Bookmarks bar"],
        },
        {
          title: "OpenAI",
          url: "https://openai.com",
          folderPath: ["Bookmarks bar", "Reading"],
        },
      ],
      folderPaths: [
        ["Bookmarks bar"],
        ["Bookmarks bar", "Reading"],
        ["Bookmarks bar", "Empty folder"],
      ],
    });
  });

  it("ignores malformed Chrome bookmark tree values", () => {
    expect(parseChromeBookmarksTree(null)).toEqual({
      bookmarks: [],
      folderPaths: [],
    });
    expect(parseChromeBookmarksTree([null, "invalid", { title: 42 }])).toEqual({
      bookmarks: [],
      folderPaths: [],
    });
  });

  it("creates parent paths before their imported subcollections", () => {
    expect(
      getImportFolderPaths([
        ["Bookmarks Bar", "Reading"],
        ["Bookmarks Bar", "Work"],
      ]),
    ).toEqual([
      ["Bookmarks Bar"],
      ["Bookmarks Bar", "Reading"],
      ["Bookmarks Bar", "Work"],
    ]);
  });

  it("reuses existing collections by their full hierarchy", () => {
    const folderIdByPath = getExistingFolderIdByPath([
      { id: "root", name: "Bookmarks Bar", parent_id: null },
      { id: "reading", name: "Reading", parent_id: "root" },
      { id: "other-reading", name: "Reading", parent_id: null },
    ]);

    expect(folderIdByPath.get('["Bookmarks Bar","Reading"]')).toBe(
      "reading",
    );
    expect(folderIdByPath.get('["Reading"]')).toBe("other-reading");
  });

  it("keeps deeper browser paths distinct within the supported nesting depth", () => {
    expect(
      toSupportedFolderPath(["Bookmarks Bar", "Work", "Project"]),
    ).toEqual(["Bookmarks Bar", "Work › Project"]);
  });

  it("parses a synthetic HTML export at the current 10,000-bookmark allowance", () => {
    const anchors = Array.from(
      { length: 10_000 },
      (_, index) => `<DT><A HREF="https://fixture.test/${index}">Fixture ${index}</A></DT>`,
    ).join("");
    const startedAt = performance.now();
    const result = parseBrowserBookmarksHtml(`<DL>${anchors}</DL>`);

    expect(result.bookmarks).toHaveLength(10_000);
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });
});
