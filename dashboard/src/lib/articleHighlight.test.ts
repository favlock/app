import { describe, expect, it } from "vitest";
import {
  captureArticleSelection,
  getArticleHighlightMenuPosition,
  renderArticleHighlights,
} from "./articleHighlight";

describe("article highlights", () => {
  it("captures an anchored selection relative to the saved article only", () => {
    const article = document.createElement("article");
    article.innerHTML = "<p>Before <strong>private passage</strong> after.</p>";
    document.body.append(article);
    const text = article.querySelector("strong")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, "private passage".length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const payload = captureArticleSelection(article, selection);

    expect(payload).toMatchObject({
      quote: {
        exact: "private passage",
        prefix: "Before",
        suffix: "after.",
      },
      dom: { startPath: "0/1/0", endPath: "0/1/0" },
      color: "yellow",
      note: "",
    });
    article.remove();
    selection.removeAllRanges();
  });

  it("ignores selections outside the saved article", () => {
    const article = document.createElement("article");
    article.textContent = "Saved article";
    const outside = document.createElement("p");
    outside.textContent = "Outside text";
    document.body.append(article, outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(captureArticleSelection(article, selection)).toBeNull();
    article.remove();
    outside.remove();
    selection.removeAllRanges();
  });

  it("keeps the highlight menu inside the viewport and below a top selection", () => {
    expect(getArticleHighlightMenuPosition({
      anchorX: 5,
      anchorTop: 40,
      anchorBottom: 40,
      viewportWidth: 390,
      viewportHeight: 844,
    })).toEqual({ left: 188, top: 48, maxHeight: 784, placement: "below" });
  });

  it("places the highlight menu above a lower selection", () => {
    expect(getArticleHighlightMenuPosition({
      anchorX: 300,
      anchorTop: 500,
      anchorBottom: 520,
      viewportWidth: 1280,
      viewportHeight: 800,
    })).toEqual({ left: 300, top: 492, maxHeight: 480, placement: "above" });
  });

  it("anchors above the first line of a multi-line selection", () => {
    expect(getArticleHighlightMenuPosition({
      anchorX: 480,
      anchorTop: 120,
      anchorBottom: 220,
      viewportWidth: 960,
      viewportHeight: 600,
    })).toEqual({ left: 480, top: 112, maxHeight: 100, placement: "above" });
  });

  it("restores persisted inline marks when CSS Custom Highlights are unavailable", () => {
    const article = document.createElement("article");
    article.innerHTML = "<p>Open an article and save its clean text.</p>";
    document.body.append(article);

    const cleanup = renderArticleHighlights(article, "article-1", [{
      version: 1,
      quote: { exact: "an article", prefix: "Open", suffix: "and save" },
      position: { start: 5, end: 15 },
      dom: null,
      color: "green",
      note: "",
      capturedAt: "2026-09-04T00:00:00.000Z",
    }]);

    const marker = article.querySelector("mark[data-favlock-article-highlight]");
    expect(marker?.textContent).toBe("an article");
    expect((marker as HTMLElement).style.backgroundColor).toBe("rgb(187, 247, 208)");

    cleanup();
    expect(article.querySelector("mark")).toBeNull();
    expect(article.textContent).toBe("Open an article and save its clean text.");
    article.remove();
  });
});
