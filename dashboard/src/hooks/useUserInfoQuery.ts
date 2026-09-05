import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import {
  fetchUserInfo,
  USER_INFO_STALE_TIME,
  userInfoQueryKey,
  type UserInfo,
} from "../lib/userInfo";
import {
  updateAccountPreferences,
  updateAccountProfile,
  isSearchEngineSlug,
} from "../lib/accountSettingsApi";

export const useUserInfo = () => {
  const { session, user } = useAuth();

  return useQuery({
    queryKey: userInfoQueryKey(user?.id),
    queryFn: () => fetchUserInfo(session?.access_token ?? ""),
    enabled: !!user && !!session?.access_token,
    staleTime: USER_INFO_STALE_TIME,
    gcTime: 1000 * 60 * 10,
  });
};

export const useUpdateUserInfo = () => {
  const { session, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (info: Pick<UserInfo, "first_name" | "last_name">) => {
      if (!user || !session?.access_token) throw new Error("Not authenticated");
      const settings = await updateAccountProfile(session.access_token, {
        firstName: info.first_name,
        lastName: info.last_name,
      });
      return {
        first_name: settings.firstName,
        last_name: settings.lastName,
      };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        userInfoQueryKey(user?.id),
        (old: UserInfo | null) => (old ? { ...old, ...data } : old),
      );
    },
  });
};

export const useUpdateSearchEngine = () => {
  const { session, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (engineName: string) => {
      if (!user || !session?.access_token) throw new Error("Not authenticated");

      const slug = engineName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!isSearchEngineSlug(slug)) {
        throw new Error("The selected search engine is not supported.");
      }

      await updateAccountPreferences(session.access_token, {
        defaultSearchEngine: slug,
      });
      return slug;
    },
    onSuccess: (slug) => {
      queryClient.setQueryData(
        userInfoQueryKey(user?.id),
        (old: UserInfo | null) =>
          old ? { ...old, default_search_engine: slug } : old,
      );
      void queryClient.invalidateQueries({
        queryKey: userInfoQueryKey(user?.id),
      });
    },
  });
};

export const useUpdateBookmarkSearchShortcuts = () => {
  const { session, user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = userInfoQueryKey(user?.id);

  return useMutation({
    scope: { id: "bookmark-search-shortcuts" },
    mutationFn: async (enabled: boolean) => {
      if (!user || !session?.access_token) throw new Error("Not authenticated");
      await updateAccountPreferences(session.access_token, {
        bookmarkSearchShortcutsEnabled: enabled,
      });
      return enabled;
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserInfo | null>(queryKey);

      queryClient.setQueryData<UserInfo | null>(queryKey, (old) =>
        old
          ? { ...old, bookmark_search_shortcuts_enabled: enabled }
          : old,
      );

      return { previous };
    },
    onError: (_error, _enabled, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey,
      }),
  });
};
