import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { HighlightSearchMatch } from "../lib/highlightSearch";
import HighlightSearchResults from "./HighlightSearchResults";

const match = {
  highlight: {
    id: "highlight-1",
    bookmarkId: "bookmark-1",
    entryId: null,
    payload: {
      version: 1,
      quote: { exact: "Selected private passage", prefix: "", suffix: "" },
      position: null,
      dom: null,
      color: "yellow",
      note: "",
      capturedAt: "2026-09-04T00:00:00.000Z",
    },
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  },
  sourceTitle: "Example article",
  sourceUrl: "https://example.com/article",
  score: 40,
} satisfies HighlightSearchMatch;

describe("HighlightSearchResults", () => {
  it("shows matching quotes and links to the filtered Readspace Highlights tab", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(
      <MemoryRouter>
        <HighlightSearchResults matches={[match]} query="private passage" />
      </MemoryRouter>,
    ));

    expect(container.textContent).toContain("Matching highlights");
    expect(container.textContent).toContain("Selected private passage");
    expect(container.textContent).toContain("Example article");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/readspace?view=highlights&q=private+passage",
    );

    await act(async () => root.unmount());
    container.remove();
  });
});
