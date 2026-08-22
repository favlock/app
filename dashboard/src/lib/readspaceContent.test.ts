import { describe, expect, it } from "vitest";
import {
  normalizeReaderReference,
  parseReadspaceContent,
  READSPACE_SERIALIZED_MAX_BYTES,
  sanitizeReadspaceHtml,
  serializeReadspaceContent,
} from "./readspaceContent";

const reference = {
  title: "A useful article",
  siteName: "Example",
  byline: "Ada Reader",
  publishedAt: "2026-08-04T09:30:00.000Z",
  updatedAt: "2026-08-05T10:45:00.000Z",
  sourceUrl: "https://example.com/articles/useful",
  html: '<h2>First section</h2><p>Saved <strong>article</strong> text with a <a href="https://example.com/source" target="_blank" rel="noreferrer noopener">link</a>.</p>',
  capturedAt: "2026-08-05T12:00:00.000Z",
};

describe("Readspace content", () => {
  it("normalizes an http source reference", () => {
    expect(normalizeReaderReference(reference)).toEqual(reference);
  });

  it("stores sanitized article content with its source metadata", () => {
    const normalized = normalizeReaderReference({
      ...reference,
      excerpt: "Copyrighted summary",
      html: '<p>Saved article</p><img src="x"><script>alert(1)</script>',
      textLength: 20,
      readingMinutes: 2,
    })!;
    const serialized = serializeReadspaceContent(normalized);

    expect(serialized).not.toContain("Copyrighted summary");
    expect(serialized).not.toContain("textLength");
    expect(serialized).not.toContain("readingMinutes");
    expect(serialized).toContain("Saved article");
    expect(serialized).not.toContain("script");
    expect(serialized).not.toContain("img");
    expect(parseReadspaceContent(serialized)).toMatchObject({
      version: 5,
      ...reference,
      html: "<p>Saved article</p>",
    });
  });

  it("rejects incomplete or non-http references", () => {
    expect(
      normalizeReaderReference({ ...reference, sourceUrl: "file:///tmp/a" }),
    ).toBeNull();
    expect(normalizeReaderReference({ ...reference, title: "" })).toBeNull();
  });

  it("allows only reader text, headings, lists, formatting, and safe links", () => {
    expect(
      sanitizeReadspaceHtml(
        '<h2 onclick="x">Heading</h2><p><em>Text</em><a href="javascript:x">bad</a><a href="https://safe.example/path">safe</a></p><iframe>hidden</iframe>',
      ),
    ).toBe(
      '<h2>Heading</h2><p><em>Text</em>bad<a href="https://safe.example/path" target="_blank" rel="noreferrer noopener">safe</a></p>',
    );
  });

  it("keeps the encrypted payload within the database-safe plaintext budget", () => {
    const serialized = serializeReadspaceContent({
      ...reference,
      html: Array.from(
        { length: 400 },
        (_, index) => `<p>${index} ${"\\".repeat(500)}</p>`,
      ).join(""),
    });

    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      READSPACE_SERIALIZED_MAX_BYTES,
    );
    expect(parseReadspaceContent(serialized)?.html).toContain("<p>0 ");
  });
});
