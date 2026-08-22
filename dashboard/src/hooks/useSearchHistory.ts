import { useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useUserInfo } from "./useUserInfoQuery";
import {
  addSearchHistoryEntry,
  clearCloudSearchHistoryForUser,
  clearLocalSearchHistoryForUser,
  loadCloudSearchHistory,
  loadLocalSearchHistory,
  saveCloudSearchHistory,
  saveLocalSearchHistory,
  type SearchHistoryEntry,
  type SearchHistoryMode,
} from "../lib/searchHistory";

export const searchHistoryQueryKey = (
  userId: string | undefined,
  mode: SearchHistoryMode,
) => ["search-history", userId, mode] as const;

export function useSearchHistory() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token ?? "";
  const { cryptoKey, decryptField, encryptField } = useEncryption();
  const { data: userInfo } = useUserInfo();
  const queryClient = useQueryClient();
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mode = userInfo?.search_history_mode ?? "cloud";
  const queryKey = searchHistoryQueryKey(user?.id, mode);

  const historyQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user || !cryptoKey || mode === "off") return [];
      if (mode === "cloud" && !accessToken) {
        throw new Error("Please sign in again before continuing.");
      }
      return mode === "cloud"
        ? loadCloudSearchHistory(accessToken, decryptField)
        : loadLocalSearchHistory(user.id, decryptField);
    },
    enabled: !!user && !!cryptoKey,
    // Cloud history is loaded once per session and writes update this cache.
    // Route navigation must not turn autocomplete into a server read.
    staleTime: Number.POSITIVE_INFINITY,
  });

  const saveHistory = useCallback(
    async (entries: SearchHistoryEntry[]) => {
      if (!user || mode === "off") return;
      if (mode === "cloud") {
        await saveCloudSearchHistory(
          accessToken,
          entries,
          encryptField,
        );
      } else {
        await saveLocalSearchHistory(user.id, entries, encryptField);
      }
      queryClient.setQueryData(queryKey, entries);
    },
    [accessToken, encryptField, mode, queryClient, queryKey, user],
  );

  const addSearch = useCallback(
    async (query: string) => {
      if (!user || mode === "off") return;
      const cached =
        queryClient.getQueryData<SearchHistoryEntry[]>(queryKey) ??
        historyQuery.data ??
        [];
      const nextEntries = addSearchHistoryEntry(cached, query);
      queryClient.setQueryData(queryKey, nextEntries);
      writeQueueRef.current = writeQueueRef.current
        .catch(() => undefined)
        .then(() => saveHistory(nextEntries));
      await writeQueueRef.current;
    },
    [historyQuery.data, mode, queryClient, queryKey, saveHistory, user],
  );

  const clearHistory = useCallback(async () => {
    if (!user) return;
    clearLocalSearchHistoryForUser(user.id);
    if (accessToken) {
      await clearCloudSearchHistoryForUser(accessToken);
    }
    queryClient.setQueriesData<SearchHistoryEntry[]>(
      { queryKey: ["search-history", user.id] },
      [],
    );
  }, [accessToken, queryClient, user]);

  return {
    entries: historyQuery.data ?? [],
    searches: (historyQuery.data ?? []).map((entry) => entry.query),
    mode,
    isLoading: historyQuery.isLoading,
    error: historyQuery.error,
    addSearch,
    clearHistory,
  };
}
