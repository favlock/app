import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { createSavedSmartView, deleteSavedSmartView, loadSavedSmartViews, updateSavedSmartView, type NewSavedSmartView, type SavedSmartView, type SavedSmartViewAppearance } from "../lib/savedSmartViews";

export const savedSmartViewsQueryKey = (userId: string | undefined) => ["saved-smart-views", userId] as const;
const EMPTY_VIEWS: SavedSmartView[] = [];

export function useSavedSmartViews() {
  const { user, session, isLocalAccount } = useAuth();
  const { cryptoKey, decryptField, encryptField } = useEncryption();
  const client = useQueryClient();
  const token = session?.access_token ?? "";
  const key = savedSmartViewsQueryKey(user?.id);
  const views = useQuery({
    queryKey: key,
    queryFn: () => loadSavedSmartViews(token, decryptField),
    enabled: !!user && !!cryptoKey && !!token && !isLocalAccount,
    staleTime: 30_000,
  });
  const create = useMutation({
    mutationFn: (view: NewSavedSmartView) => createSavedSmartView(token, view, encryptField),
    onSuccess: (view) => client.setQueryData<SavedSmartView[]>(key, (current) => [...(current ?? []), view]),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteSavedSmartView(token, id),
    onSuccess: (_data, id) => client.setQueryData<SavedSmartView[]>(key, (current) => current?.filter((view) => view.id !== id)),
  });
  const update = useMutation({
    mutationFn: ({ view, appearance }: { view: SavedSmartView; appearance: SavedSmartViewAppearance }) =>
      updateSavedSmartView(token, view, appearance, encryptField),
    onSuccess: (updated) => client.setQueryData<SavedSmartView[]>(key,
      (current) => current?.map((view) => view.id === updated.id ? updated : view)),
  });
  return { views: views.data ?? EMPTY_VIEWS, isLoading: views.isLoading,
    ready: !!user && !!cryptoKey && !!token && !isLocalAccount, error: views.error,
    create: create.mutateAsync, update: update.mutateAsync, remove: remove.mutateAsync,
    creating: create.isPending, updating: update.isPending, removing: remove.isPending, refetch: views.refetch };
}
