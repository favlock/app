import type { Entry } from "../types/bookmark";
import { getEntryText } from "./entryContent";

export interface EntrySearchMatch<TEntry extends Entry = Entry> {
  entry: TEntry;
  excerpt: string;
  score: number;
}

export interface EntrySearchOptions {
  includeContent?: boolean;
}

interface EntrySearchDocument {
  title: string;
  content: string;
  plainContent: string;
  category: string;
  tags: string;
  searchableText: string;
}

const documentCache = new WeakMap<Entry, EntrySearchDocument>();

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function buildExcerpt(text: string, terms: string[], maxLength = 180): string {
  if (text.length <= maxLength) return text;

  const normalizedText = text.toLocaleLowerCase();
  const firstMatch = terms.reduce((best, term) => {
    const index = normalizedText.indexOf(term);
    if (index === -1) return best;
    return best === -1 || index < best ? index : best;
  }, -1);
  const start = Math.max(0, firstMatch === -1 ? 0 : firstMatch - 48);
  const end = Math.min(text.length, start + maxLength);

  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${
    end < text.length ? "…" : ""
  }`;
}

function getSearchDocument(entry: Entry): EntrySearchDocument {
  const cached = documentCache.get(entry);
  if (cached) return cached;

  const title = normalizeSearchText(entry.title);
  const plainContent = getEntryText(entry.content).replace(/\s+/g, " ").trim();
  const content = normalizeSearchText(plainContent);
  const category = normalizeSearchText(entry.folder?.name ?? "");
  const tags = normalizeSearchText(
    entry.tags?.map((tag) => tag.name).join(" ") ?? "",
  );
  const document = {
    title,
    content,
    plainContent,
    category,
    tags,
    searchableText: `${title} ${content} ${category} ${tags}`,
  };
  documentCache.set(entry, document);
  return document;
}

export function searchEntries<TEntry extends Entry>(
  entries: TEntry[],
  query: string,
  { includeContent = true }: EntrySearchOptions = {},
): EntrySearchMatch<TEntry>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const terms = normalizedQuery.split(" ").filter(Boolean);

  return entries
    .map((entry) => {
      const { title, content, plainContent, category, tags, searchableText } =
        getSearchDocument(entry);

      const allowedSearchText = includeContent
        ? searchableText
        : `${title} ${category} ${tags}`;

      if (!terms.every((term) => allowedSearchText.includes(term))) return null;

      let score = 0;
      for (const term of terms) {
        if (title === term) score += 100;
        if (title.startsWith(term)) score += 60;
        if (title.includes(term)) score += 40;
        if (tags.includes(term)) score += 24;
        if (category.includes(term)) score += 18;
        if (includeContent && content.includes(term)) score += 12;
      }

      return {
        entry,
        excerpt: includeContent ? buildExcerpt(plainContent, terms) : "",
        score,
      } satisfies EntrySearchMatch<TEntry>;
    })
    .filter((match): match is EntrySearchMatch<TEntry> => match !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.entry.created_at.localeCompare(left.entry.created_at);
    });
}
