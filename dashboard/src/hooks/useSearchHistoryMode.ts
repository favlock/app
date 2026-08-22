import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import {
  clearCloudSearchHistoryForUser,
  clearLocalSearchHistoryForUser,
  loadCloudSearchHistory,
  loadLocalSearchHistory,
  saveCloudSearchHistory,
  saveLocalSearchHistory,
  type SearchHistoryEntry,
  type SearchHistoryMode,
} from "../lib/searchHistory";
import { updateAccountPreferences } from "../lib/accountSettingsApi";
import { userInfoQueryKey, type UserInfo } from "../lib/userInfo";
import { searchHistoryQueryKey } from "./useSearchHistory";

export function useUpdateSearchHistoryMode() {
  const { session, user } = useAuth();
  const { decryptField, encryptField } = useEncryption();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      currentMode,
      nextMode,
    }: {
      currentMode: SearchHistoryMode;
      nextMode: SearchHistoryMode;
    }) => {
      if (!user || !session?.access_token) throw new Error("Not authenticated");
      if (currentMode === nextMode) return nextMode;

      let entries =
        queryClient.getQueryData<SearchHistoryEntry[]>(
          searchHistoryQueryKey(user.id, currentMode),
        ) ?? [];

      if (entries.length === 0 && currentMode === "cloud") {
        entries = await loadCloudSearchHistory(
          session.access_token,
          decryptField,
        );
      } else if (entries.length === 0 && currentMode === "local") {
        entries = await loadLocalSearchHistory(user.id, decryptField);
      }

      if (nextMode === "cloud") {
        await saveCloudSearchHistory(
          session.access_token,
          entries,
          encryptField,
        );
        clearLocalSearchHistoryForUser(user.id);
      } else if (nextMode === "local") {
        await saveLocalSearchHistory(user.id, entries, encryptField);
        await clearCloudSearchHistoryForUser(session.access_token);
      } else {
        clearLocalSearchHistoryForUser(user.id);
        await clearCloudSearchHistoryForUser(session.access_token);
        entries = [];
      }

      await updateAccountPreferences(session.access_token, {
        searchHistoryMode: nextMode,
      });

      queryClient.setQueryData(
        searchHistoryQueryKey(user.id, nextMode),
        entries,
      );
      return nextMode;
    },
    onSuccess: (nextMode) => {
      queryClient.setQueryData(
        userInfoQueryKey(user?.id),
        (old: UserInfo | null | undefined) =>
          old ? { ...old, search_history_mode: nextMode } : old,
      );
    },
  });
}
