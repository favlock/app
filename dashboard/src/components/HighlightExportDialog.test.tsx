import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebHighlight } from "../hooks/useHighlightsQuery";
import type { Bookmark } from "../types/bookmark";
import HighlightExportDialog from "./HighlightExportDialog";

const { serializeHighlightsExport } = vi.hoisted(() => ({
  serializeHighlightsExport: vi.fn(() => "readable export"),
}));
vi.mock("../lib/highlightExport", () => ({ serializeHighlightsExport }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = "2026-09-03T10:00:00.000Z";
const bookmark: Bookmark = {
  id: "bookmark-1",
  user_id: "user-1",
  title: "Source",
  url: "https://example.com",
  created_at: timestamp,
};
const highlight: WebHighlight = {
  id: "highlight-1",
  bookmarkId: bookmark.id,
  createdAt: timestamp,
  updatedAt: timestamp,
  payload: {
    version: 1,
    quote: { exact: "Private quote", prefix: "", suffix: "" },
    position: null,
    dom: null,
    color: "green",
    note: "Private annotation",
    capturedAt: timestamp,
  },
};

describe("HighlightExportDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  const createObjectURL = vi.fn(() => "blob:highlight-export");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("warns about plaintext and downloads the chosen readable format", async () => {
    const onClose = vi.fn();
    await act(async () => root.render(
      <HighlightExportDialog
        highlights={[highlight]}
        bookmarks={[bookmark]}
        scopeLabel="One highlight"
        onClose={onClose}
      />,
    ));

    expect(document.body.textContent).toContain(
      "Quotes, source links, and annotations in this download are not encrypted.",
    );
    const jsonFormat = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Structured data"),
    ) as HTMLButtonElement;
    await act(async () => jsonFormat.click());
    const download = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Download JSON"),
    ) as HTMLButtonElement;
    await act(async () => download.click());

    expect(serializeHighlightsExport).toHaveBeenCalledWith(
      "json",
      [highlight],
      [bookmark],
    );
    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: "application/json;charset=utf-8" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
