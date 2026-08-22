import { describe, expect, it } from "vitest";
import type { HomeReadspaceArticle } from "./homeLibrary";
import { searchReadspaceArticles } from "./readspaceSearch";

function article(
  id: string,
  title: string,
  html: string,
): HomeReadspaceArticle {
  return {
    entry: {
      id,
      user_id: "user-1",
      kind: "read",
      title,
      content: "encrypted-content",
      created_at: `2026-01-0${id}.000Z`,
      updated_at: `2026-01-0${id}.000Z`,
      folder: null,
      tags: [],
    },
    content: {
      version: 5,
      title,
      siteName: "FavLock Journal",
      byline: "Ada Writer",
      publishedAt: "",
      updatedAt: "",
      sourceUrl: `https://example.com/${id}`,
      html,
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("Readspace full-text search", () => {
  it("finds text that exists only inside the saved article body", () => {
    const result = searchReadspaceArticles(
      [article("1", "Encryption guide", "<p>The lunar archive protocol</p>")],
      "lunar archive",
    );

    expect(result.total).toBe(1);
    expect(result.matches[0].article.entry.id).toBe("1");
    expect(result.matches[0].excerpt).toContain("lunar archive protocol");
  });

  it("searches source metadata and keeps the returned result set bounded", () => {
    const articles = [
      article("1", "First", "<p>Private research</p>"),
      article("2", "Second", "<p>Private notes</p>"),
    ];
    const result = searchReadspaceArticles(articles, "FavLock journal", 1);

    expect(result.total).toBe(2);
    expect(result.matches).toHaveLength(1);
  });

  it("limits non-full-text search to title, tags, and category", () => {
    const savedArticle = article(
      "1",
      "Encryption guide",
      "<p>The lunar archive protocol</p>",
    );
    savedArticle.entry.folder = {
      id: "folder-1",
      user_id: "user-1",
      name: "Research",
      color: null,
      parent_id: null,
      sort_order: 0,
      created_at: "2026-01-01T00:00:00.000Z",
    };
    savedArticle.entry.tags = [
      {
        id: "tag-1",
        user_id: "user-1",
        name: "privacy",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const options = { includeContent: false };

    expect(
      searchReadspaceArticles([savedArticle], "lunar", 100, options).total,
    ).toBe(0);
    expect(
      searchReadspaceArticles([savedArticle], "FavLock journal", 100, options)
        .total,
    ).toBe(0);
    expect(
      searchReadspaceArticles([savedArticle], "encryption", 100, options).total,
    ).toBe(1);
    expect(
      searchReadspaceArticles([savedArticle], "privacy", 100, options).total,
    ).toBe(1);
    expect(
      searchReadspaceArticles([savedArticle], "research", 100, options).total,
    ).toBe(1);
  });
});
