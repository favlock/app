import { describe, expect, it } from "vitest";
import type { WebHighlight } from "../hooks/useHighlightsQuery";
import type { Bookmark } from "../types/bookmark";
import { searchHighlights } from "./highlightSearch";

const bookmark = {
  id: "bookmark-1",
  user_id: "user-1",
  title: "Café research",
  url: "https://example.com/research",
  created_at: "2026-09-04T00:00:00.000Z",
  is_highlight_source: true,
} satisfies Bookmark;

const highlight = {
  id: "highlight-1",
  bookmarkId: bookmark.id,
  entryId: null,
  payload: {
    version: 1,
    quote: { exact: "A private passage worth remembering", prefix: "", suffix: "" },
    position: null,
    dom: null,
    color: "yellow",
    note: "Use this in the launch brief",
    capturedAt: "2026-09-04T00:00:00.000Z",
  },
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z",
} satisfies WebHighlight;

describe("highlight search", () => {
  it("searches highlighted text and normalized source metadata", () => {
    expect(searchHighlights([highlight], [bookmark], [], "private remembering"))
      .toHaveLength(1);
    expect(searchHighlights([highlight], [bookmark], [], "cafe example.com"))
      .toHaveLength(1);
  });

  it("only searches annotations when full-content search is enabled", () => {
    expect(searchHighlights([highlight], [bookmark], [], "launch brief"))
      .toHaveLength(0);
    expect(searchHighlights(
      [highlight],
      [bookmark],
      [],
      "launch brief",
      { includeAnnotations: true },
    )).toHaveLength(1);
  });
});
