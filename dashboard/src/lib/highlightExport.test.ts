import { describe, expect, it } from "vitest";
import type { WebHighlight } from "../hooks/useHighlightsQuery";
import type { Bookmark } from "../types/bookmark";
import {
  buildHighlightExportDocument,
  buildHighlightsHtml,
  buildHighlightsMarkdown,
} from "./highlightExport";

const timestamp = "2026-09-03T10:00:00.000Z";
const bookmarks: Bookmark[] = [{
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Research <notes>",
  url: "https://example.com/article?one=1&two=2",
  created_at: timestamp,
}];
const highlights: WebHighlight[] = [{
  id: "22222222-2222-4222-8222-222222222222",
  bookmarkId: bookmarks[0].id,
  createdAt: timestamp,
  updatedAt: timestamp,
  payload: {
    version: 1,
    quote: { exact: "A private <quote>", prefix: "before", suffix: "after" },
    position: { start: 2, end: 19 },
    dom: null,
    color: "green",
    note: "Useful *annotation*\nSecond line",
    capturedAt: timestamp,
  },
}];

describe("highlight exports", () => {
  it("builds a versioned JSON document grouped by source", () => {
    expect(buildHighlightExportDocument(highlights, bookmarks, new Date(timestamp))).toEqual({
      format: "favlock-highlights-export",
      version: 1,
      exportedAt: timestamp,
      sources: [{
        sourceType: "bookmark",
        sourceId: bookmarks[0].id,
        title: "Research <notes>",
        url: "https://example.com/article?one=1&two=2",
        highlights: [expect.objectContaining({
          id: highlights[0].id,
          color: "green",
          annotation: "Useful *annotation*\nSecond line",
        })],
      }],
    });
  });

  it("escapes Markdown control characters while preserving quote structure", () => {
    const markdown = buildHighlightsMarkdown(highlights, bookmarks, new Date(timestamp));
    expect(markdown).toContain("## [Research \\<notes\\>](<https://example.com/article?one=1&two=2>)");
    expect(markdown).toContain("> A private \\<quote\\>");
    expect(markdown).toContain("Useful \\*annotation\\*");
  });

  it("creates inert, escaped, self-contained HTML", () => {
    const html = buildHighlightsHtml(highlights, bookmarks, new Date(timestamp));
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("Research &lt;notes&gt;");
    expect(html).toContain("A private &lt;quote&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("A private <quote>");
  });
});
