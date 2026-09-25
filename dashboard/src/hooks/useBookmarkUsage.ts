import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "../context/useAuth";
import { loadBookmarkUsage } from "../lib/bookmarkUsage";
import { queueCloudBookmarkOpen } from "../lib/cloudBookmarkUsageQueue";
import { loadLocalBookmarkUsage, recordLocalBookmarkOpen } from "../lib/localBookmarkUsage";

export function useBookmarkUsage(enabled = true) {
  const { user, session, isLocalAccount } = useAuth();
  return useQuery({
    queryKey: ["bookmark-usage", user?.id],
    queryFn: () => isLocalAccount ? loadLocalBookmarkUsage(user!.id) : loadBookmarkUsage(user!.id, session!.access_token),
    enabled: enabled && !!user && (isLocalAccount || !!session?.access_token),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: enabled && !isLocalAccount ? 60_000 : false,
  });
}

export function useRecordBookmarkOpen() {
  const { user, isLocalAccount } = useAuth();
  const client = useQueryClient();
  return useCallback((bookmarkId: string) => {
    if (!user) return;
    const queryKey = ["bookmark-usage", user.id];
    if (isLocalAccount) {
      client.setQueryData(queryKey, recordLocalBookmarkOpen(user.id, bookmarkId));
    } else {
      void queueCloudBookmarkOpen(user.id, bookmarkId)
        .then(() => {
          if (client.getQueryData(queryKey)) client.setQueryData<Record<string, number>>(queryKey, (counts) => ({
            ...counts, [bookmarkId]: (counts?.[bookmarkId] ?? 0) + 1,
          }));
        })
        .catch(() => { /* Opening the link must remain independent of usage tracking. */ });
    }
  }, [user, isLocalAccount, client]);
}
