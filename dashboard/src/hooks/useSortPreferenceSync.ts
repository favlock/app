import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { useAccountPlan } from "./useAccountPlanQuery";
import { useBookmarkSorting, type BookmarkSortPreference } from "./useBookmarkSorting";
import { loadCloudSortPreferences, saveCloudSortPreferences, type CloudSortPreferences } from "../lib/sortPreferencesApi";

export const sortPreferencesQueryKey = (userId: string | undefined) => ["sort-preferences", userId];

export function useSortPreferenceSync() {
  const { user, session, isLocalAccount } = useAuth();
  const { data: plan } = useAccountPlan();
  const canSync = !isLocalAccount && plan?.id === "pro";
  const [value, saveDevice] = useBookmarkSorting(user?.id);
  const client = useQueryClient();
  const key = sortPreferencesQueryKey(user?.id);
  const token = session?.access_token ?? "";
  const remote = useQuery({
    queryKey: key,
    queryFn: () => loadCloudSortPreferences(token),
    enabled: !!user && !!token && !isLocalAccount,
    staleTime: 15_000,
    refetchInterval: canSync ? 30_000 : false,
    retry: false,
  });
  const cloudMode = !isLocalAccount && !!remote.data?.preferences;
  const mutation = useMutation({
    mutationKey: key,
    networkMode: "always",
    mutationFn: async ({ preferences, ownerId, accessToken }: {
      preferences: BookmarkSortPreference | null;
      ownerId: string;
      accessToken: string;
    }) => {
      if (!user || isLocalAccount || !token) throw new Error("A cloud account is required.");
      if (preferences && !canSync) throw new Error("Cloud sorting requires FavLock Pro.");
      if (preferences === null && !saveDevice(value)) {
        throw new Error("Device storage is unavailable. The cloud copy has been kept.");
      }
      const mutationKey = sortPreferencesQueryKey(ownerId);
      await client.cancelQueries({ queryKey: mutationKey });
      const current = client.getQueryData<CloudSortPreferences>(mutationKey);
      if (!current) throw new Error("Load cloud settings before changing storage.");
      return saveCloudSortPreferences(accessToken, preferences, current.version);
    },
    onSuccess: async (result, { ownerId }) => {
      await client.cancelQueries({ queryKey: sortPreferencesQueryKey(ownerId) });
      client.setQueryData(sortPreferencesQueryKey(ownerId), result);
      if (user?.id === ownerId && result.preferences) saveDevice(result.preferences);
    },
  });

  // Cloud choices are also cached on this device for offline use. A Free
  // account keeps its device choice until it explicitly removes the cloud copy.
  useEffect(() => {
    if (canSync && remote.data?.preferences && !mutation.isPending) {
      saveDevice(remote.data.preferences);
    }
  }, [canSync, remote.data, saveDevice, mutation.isPending]);

  const update = (next: BookmarkSortPreference) => {
    if (mutation.isPending) return;
    saveDevice(next);
    if (cloudMode && canSync) mutation.mutate({ preferences: next, ownerId: user!.id, accessToken: token });
  };
  const setMode = (mode: "local" | "cloud") => {
    if (mutation.isPending) return;
    // Keep the current on-device copy, and only report Local after the
    // server has removed its copy successfully.
    saveDevice(value);
    if (user) mutation.mutate({ preferences: mode === "cloud" ? value : null, ownerId: user.id, accessToken: token });
  };
  return {
    value, update, setMode, canSync, cloudMode, isLocalAccount,
    busy: mutation.isPending || (!isLocalAccount && remote.isLoading),
    modeReady: isLocalAccount || !!remote.data,
    error: mutation.error ?? remote.error,
    reload: () => { mutation.reset(); void remote.refetch(); },
  };
}
