import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebHighlight } from "../hooks/useHighlightsQuery";
import type { Bookmark } from "../types/bookmark";
import ReadspaceHighlights from "./ReadspaceHighlights";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const bookmarks: Bookmark[] = [
  {
    id: "bookmark-1",
    user_id: "user-1",
    title: "First source",
    url: "https://example.com/first",
    created_at: "2026-09-03T10:00:00.000Z",
  },
  {
    id: "bookmark-2",
    user_id: "user-1",
    title: "Second source",
    url: "https://example.com/second",
    created_at: "2026-09-03T10:00:00.000Z",
  },
];

function highlight(
  id: string,
  bookmarkId: string,
  quote: string,
  note = "",
): WebHighlight {
  return {
    id,
    bookmarkId,
    entryId: null,
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
    payload: {
      version: 1,
      quote: { exact: quote, prefix: "", suffix: "" },
      position: null,
      dom: null,
      color: "yellow",
      note,
      capturedAt: "2026-09-03T10:00:00.000Z",
    },
  };
}

describe("ReadspaceHighlights", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("groups highlights by source and keeps annotations beneath their quotes", async () => {
    await act(async () => root.render(
      <ReadspaceHighlights
        highlights={[
          highlight("highlight-1", "bookmark-1", "First quote", "First annotation"),
          highlight("highlight-2", "bookmark-1", "Second quote"),
          highlight("highlight-3", "bookmark-2", "Third quote", "Third annotation"),
        ]}
        bookmarks={bookmarks}
        query=""
        loading={false}
        error={false}
        deletingId={null}
        annotatingId={null}
        coloringId={null}
        annotationDisabled={false}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSelected={vi.fn()}
        onAnnotate={vi.fn()}
        onColorChange={vi.fn()}
        onExport={vi.fn()}
      />,
    ));

    const sourceGroups = container.querySelectorAll("article");
    expect(sourceGroups).toHaveLength(2);
    expect(sourceGroups[0].querySelector("h3")?.textContent).toBe("First source");
    expect(sourceGroups[0].querySelectorAll("li")).toHaveLength(2);
    expect(sourceGroups[1].querySelector("h3")?.textContent).toBe("Second source");
    expect(sourceGroups[1].querySelectorAll("li")).toHaveLength(1);

    const firstHighlight = sourceGroups[0].querySelector("li");
    expect(firstHighlight?.querySelector("blockquote")?.textContent).toBe("First quote");
    expect(firstHighlight?.textContent).toContain("First annotation");
    expect(firstHighlight?.className).toContain("py-3");
    expect(firstHighlight?.querySelector("blockquote")?.className).toContain("py-2");
    expect(
      firstHighlight?.querySelector('[role="group"][aria-label="Highlight color"]')
        ?.parentElement?.parentElement?.className,
    ).toContain("sm:flex-row");
  });

  it("disables annotations for Free users and identifies them as a Pro feature", async () => {
    const onAnnotate = vi.fn();
    await act(async () => root.render(
      <ReadspaceHighlights
        highlights={[highlight("highlight-1", "bookmark-1", "First quote")]}
        bookmarks={bookmarks}
        query=""
        loading={false}
        error={false}
        deletingId={null}
        annotatingId={null}
        coloringId={null}
        annotationDisabled
        annotationProRequired
        onRetry={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSelected={vi.fn()}
        onAnnotate={onAnnotate}
        onColorChange={vi.fn()}
        onExport={vi.fn()}
      />,
    ));

    const annotationButton = container.querySelector(
      '[aria-label="Add annotation"]',
    ) as HTMLButtonElement;
    const tooltipTrigger = annotationButton.parentElement as HTMLElement;

    expect(annotationButton.disabled).toBe(true);
    expect(tooltipTrigger.getAttribute("aria-label")).toBe(
      "Annotations are available on Pro",
    );

    await act(async () => tooltipTrigger.focus());
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toBe(
      "Available on Pro",
    );

    annotationButton.click();
    expect(onAnnotate).not.toHaveBeenCalled();
  });

  it("limits overflowing annotations to three lines and lets the user expand them", async () => {
    const longAnnotation = "A long annotation that should remain fully available when expanded.";
    await act(async () => root.render(
      <ReadspaceHighlights
        highlights={[highlight("highlight-1", "bookmark-1", "First quote", longAnnotation)]}
        bookmarks={bookmarks}
        query=""
        loading={false}
        error={false}
        deletingId={null}
        annotatingId={null}
        coloringId={null}
        annotationDisabled={false}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSelected={vi.fn()}
        onAnnotate={vi.fn()}
        onColorChange={vi.fn()}
        onExport={vi.fn()}
      />,
    ));

    const annotation = [...container.querySelectorAll("p")].find(
      (paragraph) => paragraph.textContent === longAnnotation,
    ) as HTMLParagraphElement;
    Object.defineProperty(annotation, "clientHeight", { configurable: true, value: 72 });
    Object.defineProperty(annotation, "scrollHeight", { configurable: true, value: 120 });
    await act(async () => window.dispatchEvent(new Event("resize")));

    expect(annotation.className).toContain("line-clamp-3");
    const seeMore = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "See more",
    ) as HTMLButtonElement;
    expect(seeMore.getAttribute("aria-expanded")).toBe("false");

    await act(async () => seeMore.click());
    expect(annotation.className).not.toContain("line-clamp-3");
    expect(annotation.textContent).toBe(longAnnotation);
    expect(seeMore.textContent).toBe("See less");
    expect(seeMore.getAttribute("aria-expanded")).toBe("true");
  });

  it("searches normalized terms across quotes, annotations, and source metadata", async () => {
    await act(async () => root.render(
      <ReadspaceHighlights
        highlights={[
          highlight("highlight-1", "bookmark-1", "A café research note", "Useful annotation"),
          highlight("highlight-2", "bookmark-2", "Unrelated quote"),
        ]}
        bookmarks={bookmarks}
        query="cafe annotation example.com/first"
        loading={false}
        error={false}
        deletingId={null}
        annotatingId={null}
        coloringId={null}
        annotationDisabled={false}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSelected={vi.fn()}
        onAnnotate={vi.fn()}
        onColorChange={vi.fn()}
        onExport={vi.fn()}
      />,
    ));

    const quotes = [...container.querySelectorAll("blockquote")].map(
      (quote) => quote.textContent,
    );
    expect(quotes).toEqual(["A café research note"]);
  });

  it("exports one, all, or an explicit multi-selection", async () => {
    const onExport = vi.fn();
    const highlights = [
      highlight("highlight-1", "bookmark-1", "First quote"),
      highlight("highlight-2", "bookmark-1", "Second quote"),
      highlight("highlight-3", "bookmark-2", "Third quote"),
    ];
    await act(async () => root.render(
      <ReadspaceHighlights
        highlights={highlights}
        bookmarks={bookmarks}
        query=""
        loading={false}
        error={false}
        deletingId={null}
        annotatingId={null}
        coloringId={null}
        annotationDisabled={false}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSelected={vi.fn()}
        onAnnotate={vi.fn()}
        onColorChange={vi.fn()}
        onExport={onExport}
      />,
    ));

    await act(async () => {
      (container.querySelector('[aria-label="Export this highlight"]') as HTMLButtonElement).click();
    });
    expect(onExport).toHaveBeenLastCalledWith([highlights[0]], "One highlight");

    const exportAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Export all"),
    ) as HTMLButtonElement;
    await act(async () => exportAll.click());
    expect(onExport).toHaveBeenLastCalledWith(highlights, "All highlights");

    const select = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Select",
    ) as HTMLButtonElement;
    await act(async () => select.click());
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[aria-label="Select highlight"]',
    );
    await act(async () => {
      checkboxes[0].click();
      checkboxes[2].click();
    });
    const exportSelected = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Export selected"),
    ) as HTMLButtonElement;
    await act(async () => exportSelected.click());
    expect(onExport).toHaveBeenLastCalledWith(
      [highlights[0], highlights[2]],
      "Selected highlights",
    );
  });

  it("moves all selected highlights to Trash after confirmation", async () => {
    const onDeleteSelected = vi.fn().mockResolvedValue({
      deletedIds: ["highlight-1", "highlight-2"],
      failedIds: [],
    });
    const highlights = [
      highlight("highlight-1", "bookmark-1", "First quote"),
      highlight("highlight-2", "bookmark-2", "Second quote"),
    ];
    await act(async () => root.render(
      <ReadspaceHighlights
        highlights={highlights}
        bookmarks={bookmarks}
        query=""
        loading={false}
        error={false}
        deletingId={null}
        annotatingId={null}
        coloringId={null}
        annotationDisabled={false}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSelected={onDeleteSelected}
        onAnnotate={vi.fn()}
        onColorChange={vi.fn()}
        onExport={vi.fn()}
      />,
    ));

    const select = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Select",
    ) as HTMLButtonElement;
    await act(async () => select.click());
    const selectAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Select all",
    ) as HTMLButtonElement;
    await act(async () => selectAll.click());

    const deleteAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Delete all"),
    ) as HTMLButtonElement;
    await act(async () => deleteAll.click());
    expect(document.body.textContent).toContain("Move 2 selected highlights to Trash?");

    const confirm = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Move to Trash",
    ) as HTMLButtonElement;
    await act(async () => confirm.click());

    expect(onDeleteSelected).toHaveBeenCalledWith(highlights);
    expect(container.textContent).not.toContain("selected");
  });

  it("keeps only failed highlights selected after a partial bulk deletion", async () => {
    const highlights = [
      highlight("highlight-1", "bookmark-1", "First quote"),
      highlight("highlight-2", "bookmark-2", "Second quote"),
    ];
    const onDeleteSelected = vi.fn().mockResolvedValue({
      deletedIds: ["highlight-1"],
      failedIds: ["highlight-2"],
    });
    await act(async () => root.render(
      <ReadspaceHighlights
        highlights={highlights}
        bookmarks={bookmarks}
        query=""
        loading={false}
        error={false}
        deletingId={null}
        annotatingId={null}
        coloringId={null}
        annotationDisabled={false}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSelected={onDeleteSelected}
        onAnnotate={vi.fn()}
        onColorChange={vi.fn()}
        onExport={vi.fn()}
      />,
    ));

    const select = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Select",
    ) as HTMLButtonElement;
    await act(async () => select.click());
    const selectAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Select all",
    ) as HTMLButtonElement;
    await act(async () => selectAll.click());
    const deleteAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Delete all"),
    ) as HTMLButtonElement;
    await act(async () => deleteAll.click());
    const confirm = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Move to Trash",
    ) as HTMLButtonElement;
    await act(async () => confirm.click());

    expect(document.body.textContent).toContain(
      "1 highlight moved to Trash. 1 could not be moved. Try again.",
    );
    expect(document.body.textContent).toContain("Move 1 selected highlight to Trash?");
    expect(container.textContent).toContain("1 selected");
  });

  it("moves every highlight from one source to Trash from its group header", async () => {
    const onDeleteSelected = vi.fn().mockResolvedValue({
      deletedIds: ["highlight-1", "highlight-2"],
      failedIds: [],
    });
    const highlights = [
      highlight("highlight-1", "bookmark-1", "First quote"),
      highlight("highlight-2", "bookmark-1", "Second quote"),
      highlight("highlight-3", "bookmark-2", "Third quote"),
    ];
    await act(async () => root.render(
      <ReadspaceHighlights
        highlights={highlights}
        bookmarks={bookmarks}
        query=""
        loading={false}
        error={false}
        deletingId={null}
        annotatingId={null}
        coloringId={null}
        annotationDisabled={false}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
        onDeleteSelected={onDeleteSelected}
        onAnnotate={vi.fn()}
        onColorChange={vi.fn()}
        onExport={vi.fn()}
      />,
    ));

    const deleteSource = container.querySelector(
      '[aria-label="Delete all highlights from First source"]',
    ) as HTMLButtonElement;
    await act(async () => deleteSource.click());
    expect(document.body.textContent).toContain(
      "Move all highlights from “First source” to Trash?",
    );

    const confirm = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Move to Trash",
    ) as HTMLButtonElement;
    await act(async () => confirm.click());

    expect(onDeleteSelected).toHaveBeenCalledWith(highlights.slice(0, 2));
  });
});
