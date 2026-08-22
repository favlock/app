import {
  deleteAuthenticatedWithoutResponse,
  fetchAuthenticatedJson,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";

export const SEARCH_HISTORY_LIMIT = 10;
export const SEARCH_HISTORY_STORAGE_PREFIX = "favlock:search-history";

export type SearchHistoryMode = "cloud" | "local" | "off";

export interface SearchHistoryEntry {
  query: string;
  searchedAt: string;
}

type Encrypt = (value: string) => Promise<string>;
type Decrypt = (value: string) => Promise<string>;

export function searchHistoryStorageKey(userId: string): string {
  return `${SEARCH_HISTORY_STORAGE_PREFIX}:${userId}`;
}

export function normalizeSearchHistory(
  entries: SearchHistoryEntry[],
): SearchHistoryEntry[] {
  const seen = new Set<string>();

  return [...entries]
    .filter(
      (entry) =>
        typeof entry?.query === "string" &&
        typeof entry?.searchedAt === "string" &&
        entry.query.trim().length > 0,
    )
    .sort(
      (left, right) =>
        new Date(right.searchedAt).getTime() -
        new Date(left.searchedAt).getTime(),
    )
    .filter((entry) => {
      const normalizedQuery = entry.query.trim().toLocaleLowerCase();
      if (seen.has(normalizedQuery)) return false;
      seen.add(normalizedQuery);
      return true;
    })
    .slice(0, SEARCH_HISTORY_LIMIT)
    .map((entry) => ({ ...entry, query: entry.query.trim() }));
}

export function addSearchHistoryEntry(
  entries: SearchHistoryEntry[],
  query: string,
  searchedAt = new Date().toISOString(),
): SearchHistoryEntry[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return normalizeSearchHistory(entries);

  return normalizeSearchHistory([
    { query: trimmedQuery, searchedAt },
    ...entries,
  ]);
}

export async function decryptSearchHistory(
  encryptedHistory: string | null | undefined,
  decrypt: Decrypt,
): Promise<SearchHistoryEntry[]> {
  if (!encryptedHistory) return [];

  try {
    const plaintext = await decrypt(encryptedHistory);
    const parsed: unknown = JSON.parse(plaintext);
    return Array.isArray(parsed)
      ? normalizeSearchHistory(parsed as SearchHistoryEntry[])
      : [];
  } catch {
    return [];
  }
}

export async function loadLocalSearchHistory(
  userId: string,
  decrypt: Decrypt,
): Promise<SearchHistoryEntry[]> {
  return decryptSearchHistory(
    window.localStorage.getItem(searchHistoryStorageKey(userId)),
    decrypt,
  );
}

export async function saveLocalSearchHistory(
  userId: string,
  entries: SearchHistoryEntry[],
  encrypt: Encrypt,
): Promise<void> {
  const encrypted = await encrypt(JSON.stringify(normalizeSearchHistory(entries)));
  window.localStorage.setItem(searchHistoryStorageKey(userId), encrypted);
}

export function clearLocalSearchHistoryForUser(userId: string): void {
  window.localStorage.removeItem(searchHistoryStorageKey(userId));
}

export async function loadCloudSearchHistory(
  accessToken: string,
  decrypt: Decrypt,
): Promise<SearchHistoryEntry[]> {
  const response = await fetchAuthenticatedJson(
    "/v1/account/search-history",
    accessToken,
    "Could not load your encrypted search history.",
  );
  if (
    !isRecord(response) ||
    !isRecord(response.data) ||
    (response.data.encryptedHistory !== null &&
      typeof response.data.encryptedHistory !== "string")
  ) {
    throw new Error("Could not load your encrypted search history.");
  }
  return decryptSearchHistory(response.data.encryptedHistory, decrypt);
}

export async function saveCloudSearchHistory(
  accessToken: string,
  entries: SearchHistoryEntry[],
  encrypt: Encrypt,
): Promise<void> {
  const encryptedHistory = await encrypt(
    JSON.stringify(normalizeSearchHistory(entries)),
  );
  await putAuthenticatedJsonWithoutResponse(
    "/v1/account/search-history",
    accessToken,
    { encryptedHistory },
    "Could not save your encrypted search history.",
  );
}

export async function clearCloudSearchHistoryForUser(
  accessToken: string,
): Promise<void> {
  await deleteAuthenticatedWithoutResponse(
    "/v1/account/search-history",
    accessToken,
    "Could not clear your encrypted search history.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
