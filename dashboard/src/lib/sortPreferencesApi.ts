import { fetchAuthenticatedJson, putAuthenticatedJson } from "./authenticatedApi";
import { SORT_LABELS } from "./bookmarkSorting";
import type { BookmarkSortPreference } from "../hooks/useBookmarkSorting";

export interface CloudSortPreferences {
  preferences: BookmarkSortPreference | null;
  version: number;
}
const path = "/v1/account/sort-preferences";
const failure = "Could not sync sorting. Reload cloud settings and try again.";
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function parseCloudSortPreferences(value: unknown): CloudSortPreferences {
  if (!record(value) || !record(value.data)) throw new Error(failure);
  const { preferences, version } = value.data;
  if (!Number.isInteger(version) || Number(version) < 0 || Number(version) > 2147483646) throw new Error(failure);
  if (preferences === null) return { preferences: null, version: Number(version) };
  if (!record(preferences) || typeof preferences.order !== "string" || !Object.hasOwn(SORT_LABELS, preferences.order) ||
    typeof preferences.favoritesFirst !== "boolean" || typeof preferences.bookmarksOnly !== "boolean") throw new Error(failure);
  return {
    version: Number(version),
    preferences: {
      order: preferences.order as BookmarkSortPreference["order"],
      favoritesFirst: preferences.favoritesFirst,
      bookmarksOnly: preferences.bookmarksOnly,
    },
  };
}
export async function loadCloudSortPreferences(token: string): Promise<CloudSortPreferences> {
  return parseCloudSortPreferences(await fetchAuthenticatedJson(path, token, failure));
}
export async function saveCloudSortPreferences(token: string, preferences: BookmarkSortPreference | null, expectedVersion: number): Promise<CloudSortPreferences> {
  return parseCloudSortPreferences(await putAuthenticatedJson(path, token, { preferences, expectedVersion }, failure));
}
