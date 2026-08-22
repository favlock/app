import { getEntryText } from "./entryContent";
import type { HomeReadspaceArticle } from "./homeLibrary";

export interface ReadspaceSearchMatch {
  article: HomeReadspaceArticle;
  excerpt: string;
  score: number;
}

export interface ReadspaceSearchPage {
  matches: ReadspaceSearchMatch[];
  total: number;
}

export interface ReadspaceSearchOptions {
  includeContent?: boolean;
}

interface SearchDocument {
  title: string;
  body: string;
  plainBody: string;
  metadata: string;
  category: string;
  tags: string;
  searchableText: string;
}

const documentCache = new WeakMap<HomeReadspaceArticle, SearchDocument>();

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function getSearchDocument(article: HomeReadspaceArticle): SearchDocument {
  const cached = documentCache.get(article);
  if (cached) return cached;

  const title = normalize(article.entry.title);
  const plainBody = getEntryText(article.content.html).replace(/\s+/g, " ").trim();
  const body = normalize(plainBody);
  const category = normalize(article.entry.folder?.name ?? "");
  const tags = normalize(
    article.entry.tags?.map((tag) => tag.name).join(" ") ?? "",
  );
  const metadata = normalize(
    [
      article.content.title,
      article.content.siteName,
      article.content.byline,
      article.content.sourceUrl,
    ].join(" "),
  );
  const document = {
    title,
    body,
    plainBody,
    metadata,
    category,
    tags,
    searchableText: `${title} ${metadata} ${category} ${tags} ${body}`,
  };
  documentCache.set(article, document);
  return document;
}

function buildExcerpt(body: string, terms: string[], maxLength = 180): string {
  if (body.length <= maxLength) return body;
  const normalizedBody = body.toLocaleLowerCase();
  const firstMatch = terms.reduce((best, term) => {
    const index = normalizedBody.indexOf(term);
    if (index === -1) return best;
    return best === -1 || index < best ? index : best;
  }, -1);
  const start = Math.max(0, firstMatch === -1 ? 0 : firstMatch - 48);
  const end = Math.min(body.length, start + maxLength);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).trim()}${
    end < body.length ? "…" : ""
  }`;
}

export function searchReadspaceArticles(
  articles: HomeReadspaceArticle[],
  query: string,
  limit = 100,
  { includeContent = true }: ReadspaceSearchOptions = {},
): ReadspaceSearchPage {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { matches: [], total: 0 };
  const terms = normalizedQuery.split(" ").filter(Boolean);

  const matches = articles.flatMap((article) => {
    const document = getSearchDocument(article);
    const allowedSearchText = includeContent
      ? document.searchableText
      : `${document.title} ${document.category} ${document.tags}`;
    if (!terms.every((term) => allowedSearchText.includes(term))) {
      return [];
    }

    let score = 0;
    for (const term of terms) {
      if (document.title === term) score += 100;
      if (document.title.startsWith(term)) score += 60;
      if (document.title.includes(term)) score += 40;
      if (includeContent && document.metadata.includes(term)) score += 24;
      if (includeContent && document.body.includes(term)) score += 12;
      if (document.tags.includes(term)) score += 24;
      if (document.category.includes(term)) score += 18;
    }
    return [{
      article,
      excerpt: includeContent ? buildExcerpt(document.plainBody, terms) : "",
      score,
    } satisfies ReadspaceSearchMatch];
  });

  matches.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return right.article.entry.created_at.localeCompare(
      left.article.entry.created_at,
    );
  });

  return {
    matches: matches.slice(0, Math.max(1, limit)),
    total: matches.length,
  };
}
