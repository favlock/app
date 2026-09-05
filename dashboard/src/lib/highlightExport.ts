import type { WebHighlight } from "../hooks/useHighlightsQuery";
import type { ReadspaceContent } from "./readspaceContent";
import type { Bookmark, ReadspaceEntry } from "../types/bookmark";

export type HighlightExportArticle = { entry: ReadspaceEntry; content: ReadspaceContent };

export type HighlightExportFormat = "markdown" | "html" | "json";

export type HighlightExportSource = {
  sourceType: "bookmark" | "article";
  sourceId: string;
  title: string;
  url: string | null;
  highlights: WebHighlight[];
};

export type HighlightExportDocument = {
  format: "favlock-highlights-export";
  version: 1;
  exportedAt: string;
  sources: Array<{
    sourceType: "bookmark" | "article";
    sourceId: string;
    title: string;
    url: string | null;
    highlights: Array<{
      id: string;
      quote: WebHighlight["payload"]["quote"];
      position: WebHighlight["payload"]["position"];
      dom: WebHighlight["payload"]["dom"];
      color: WebHighlight["payload"]["color"];
      annotation: string;
      capturedAt: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }>;
};

function safeHttpUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function groupHighlightsForExport(
  highlights: WebHighlight[],
  bookmarks: Bookmark[],
  articles: HighlightExportArticle[] = [],
): HighlightExportSource[] {
  const bookmarkById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const articleById = new Map(articles.map((article) => [article.entry.id, article]));
  const groups = new Map<string, HighlightExportSource>();
  for (const highlight of highlights) {
    const sourceId = highlight.bookmarkId ?? highlight.entryId!;
    const bookmark = highlight.bookmarkId ? bookmarkById.get(highlight.bookmarkId) : null;
    const article = highlight.entryId ? articleById.get(highlight.entryId) : null;
    const existing = groups.get(sourceId);
    if (existing) {
      existing.highlights.push(highlight);
      continue;
    }
    groups.set(sourceId, {
      sourceType: highlight.entryId ? "article" : "bookmark",
      sourceId,
      title: bookmark?.title.trim() || article?.entry.title.trim() || "Saved source",
      url: safeHttpUrl(bookmark?.url ?? article?.content.sourceUrl),
      highlights: [highlight],
    });
  }
  return [...groups.values()];
}

export function buildHighlightExportDocument(
  highlights: WebHighlight[],
  bookmarks: Bookmark[],
  exportedAt = new Date(),
  articles: HighlightExportArticle[] = [],
): HighlightExportDocument {
  return {
    format: "favlock-highlights-export",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    sources: groupHighlightsForExport(highlights, bookmarks, articles).map((source) => ({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      title: source.title,
      url: source.url,
      highlights: source.highlights.map((highlight) => ({
        id: highlight.id,
        quote: highlight.payload.quote,
        position: highlight.payload.position,
        dom: highlight.payload.dom,
        color: highlight.payload.color,
        annotation: highlight.payload.note,
        capturedAt: highlight.payload.capturedAt,
        createdAt: highlight.createdAt,
        updatedAt: highlight.updatedAt,
      })),
    })),
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()<>#+.!|~-])/g, "\\$1");
}

function markdownQuote(value: string): string {
  return value.split(/\r?\n/).map((line) => `> ${escapeMarkdown(line)}`).join("\n");
}

export function buildHighlightsMarkdown(
  highlights: WebHighlight[],
  bookmarks: Bookmark[],
  exportedAt = new Date(),
  articles: HighlightExportArticle[] = [],
): string {
  const document = buildHighlightExportDocument(highlights, bookmarks, exportedAt, articles);
  const lines = [
    "# FavLock highlights",
    "",
    `Exported ${document.exportedAt}`,
  ];
  for (const source of document.sources) {
    lines.push(
      "",
      source.url
        ? `## [${escapeMarkdown(source.title)}](<${source.url}>)`
        : `## ${escapeMarkdown(source.title)}`,
    );
    for (const [index, highlight] of source.highlights.entries()) {
      lines.push(
        "",
        `### Highlight ${index + 1}`,
        "",
        markdownQuote(highlight.quote.exact),
        "",
        `**Color:** ${highlight.color[0].toUpperCase()}${highlight.color.slice(1)}`,
      );
      if (highlight.annotation) {
        lines.push(
          "",
          "**Annotation**",
          "",
          escapeMarkdown(highlight.annotation),
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildHighlightsHtml(
  highlights: WebHighlight[],
  bookmarks: Bookmark[],
  exportedAt = new Date(),
  articles: HighlightExportArticle[] = [],
): string {
  const document = buildHighlightExportDocument(highlights, bookmarks, exportedAt, articles);
  const sources = document.sources.map((source) => `
    <section>
      <h2>${source.url ? `<a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a>` : escapeHtml(source.title)}</h2>
      ${source.url ? `<p class="source">${escapeHtml(source.url)}</p>` : ""}
      ${source.highlights.map((highlight) => `
        <article>
          <blockquote class="${highlight.color}">${escapeHtml(highlight.quote.exact)}</blockquote>
          ${highlight.annotation ? `<div class="annotation"><strong>Annotation</strong><p>${escapeHtml(highlight.annotation).replaceAll("\n", "<br>")}</p></div>` : ""}
        </article>`).join("")}
    </section>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>FavLock highlights</title>
  <style>
    :root { color-scheme: light; font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1d2230; background: #fffaf0; }
    * { box-sizing: border-box; }
    body { max-width: 840px; margin: 0 auto; padding: 40px 24px 80px; line-height: 1.65; overflow-wrap: anywhere; }
    header { padding: 28px; border: 1px solid #a6d6cb; border-radius: 28px; background: #eef8f4; }
    h1 { margin: 0; font-size: clamp(1.75rem, 5vw, 2.5rem); line-height: 1.2; letter-spacing: -0.035em; }
    h2 { margin: 0; font-size: 1.3rem; line-height: 1.4; }
    a { color: #0f766e; text-decoration-thickness: 1px; text-underline-offset: 4px; }
    a:hover { text-decoration-thickness: 2px; }
    a:focus-visible { outline: 3px solid #0f766e; outline-offset: 4px; border-radius: 4px; }
    .meta, .source { color: #545b6d; font-size: 0.875rem; }
    .meta { margin: 12px 0 0; }
    .source { margin: 6px 0 0; }
    section { margin-top: 24px; padding: 24px; border: 1px solid #deded9; border-radius: 24px; background: #fffdf7; }
    article { margin-top: 20px; }
    article + article { padding-top: 20px; border-top: 1px solid #deded9; }
    blockquote { margin: 0; padding: 16px 20px; border: 1px solid #e8c88e; border-left-width: 4px; border-radius: 16px; background: #fff2da; white-space: pre-wrap; }
    blockquote.yellow { border-color: #e8c88e; background: #fff2da; }
    blockquote.green { border-color: #a6d6cb; background: #eef8f4; }
    blockquote.blue { border-color: #bad4e5; background: #edf6fb; }
    blockquote.pink { border-color: #eac0d7; background: #fbeef5; }
    .annotation { margin-top: 12px; padding: 16px 20px; border: 1px solid #cdbce2; border-radius: 16px; background: #f3edf9; }
    .annotation strong { color: #65477e; font-size: 0.875rem; }
    .annotation p { margin: 4px 0 0; }
    @media (max-width: 480px) {
      body { padding: 16px 12px 40px; }
      header, section { padding: 20px; }
      blockquote, .annotation { padding: 12px 14px; }
    }
    @media print {
      :root { background: white; }
      body { max-width: none; padding: 0; }
      header, section { border-color: #bbb; }
      article { break-inside: avoid; }
      h2 { break-after: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>FavLock highlights</h1>
    <p class="meta">Exported ${escapeHtml(document.exportedAt)}</p>
  </header>
  <main>${sources}
  </main>
</body>
</html>
`;
}

export function serializeHighlightsExport(
  format: HighlightExportFormat,
  highlights: WebHighlight[],
  bookmarks: Bookmark[],
  exportedAt = new Date(),
  articles: HighlightExportArticle[] = [],
): string {
  if (format === "markdown") {
    return buildHighlightsMarkdown(highlights, bookmarks, exportedAt, articles);
  }
  if (format === "html") {
    return buildHighlightsHtml(highlights, bookmarks, exportedAt, articles);
  }
  return `${JSON.stringify(
    buildHighlightExportDocument(highlights, bookmarks, exportedAt, articles),
    null,
    2,
  )}\n`;
}
