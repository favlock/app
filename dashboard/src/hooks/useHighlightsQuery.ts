import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import {
  createArticleHighlight,
  deleteHighlight,
  loadEncryptedHighlights,
  updateHighlightAnnotation,
  updateHighlightColor,
} from "../lib/highlightRepository";
import {
  decryptWebHighlightPayload,
  encryptWebHighlightPayload,
  type WebHighlightPayload,
} from "../lib/webHighlight";

export type WebHighlight = {
  id: string;
  bookmarkId: string | null;
  entryId: string | null;
  payload: WebHighlightPayload;
  createdAt: string;
  updatedAt: string;
};

const HIGHLIGHTS_QUERY_KEY = ["highlights"] as const;
const HIGHLIGHT_DELETE_CONCURRENCY = 4;

export type HighlightBulkDeleteResult = {
  deletedIds: string[];
  failedIds: string[];
};

function normalizeHighlightAnnotation(note: string): string {
  return note.trim().slice(0, 10_000);
}

export function useHighlights(enabled = true) {
  const { session, user } = useAuth();
  const { cryptoKey, decryptField } = useEncryption();
  return useQuery({
    queryKey: [...HIGHLIGHTS_QUERY_KEY, user?.id],
    enabled: enabled && !!session?.access_token && !!user && !!cryptoKey,
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const encrypted = await loadEncryptedHighlights(session!.access_token);
      const parsed = await Promise.all(encrypted.map(async (record) => ({
        record,
        payload: await decryptWebHighlightPayload(record.payload, decryptField),
      })));
      return parsed
        .filter((item): item is typeof item & { payload: WebHighlightPayload } => !!item.payload)
        .map(({ record, payload }) => ({
          id: record.id,
          bookmarkId: record.bookmarkId,
          entryId: record.entryId,
          payload,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }));
    },
  });
}

export function useCreateArticleHighlight() {
  const { session } = useAuth();
  const { encryptField } = useEncryption();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, payload }: {
      entryId: string;
      optimisticId: string;
      payload: WebHighlightPayload;
    }) => {
      const encrypted = await encryptWebHighlightPayload(payload, encryptField);
      return createArticleHighlight(session?.access_token ?? "", entryId, encrypted);
    },
    onMutate: async ({ entryId, optimisticId, payload }) => {
      await queryClient.cancelQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      const previous = queryClient.getQueriesData<WebHighlight[]>({
        queryKey: HIGHLIGHTS_QUERY_KEY,
      });
      const now = new Date().toISOString();
      queryClient.setQueriesData<WebHighlight[]>(
        { queryKey: HIGHLIGHTS_QUERY_KEY },
        (current) => [...(current ?? []), {
          id: optimisticId,
          bookmarkId: null,
          entryId,
          payload,
          createdAt: now,
          updatedAt: now,
        }],
      );
      return { previous };
    },
    onSuccess: (highlightId, { optimisticId }) => {
      queryClient.setQueriesData<WebHighlight[]>(
        { queryKey: HIGHLIGHTS_QUERY_KEY },
        (current) => current?.map((highlight) => highlight.id === optimisticId
          ? { ...highlight, id: highlightId }
          : highlight),
      );
      void queryClient.invalidateQueries({ queryKey: ["resource-usage"] });
      void queryClient.invalidateQueries({ queryKey: ["account-plan"] });
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, value] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, value);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });
}

export function useDeleteHighlight() {
  const { retryBookmarkCacheSync, session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (highlightId: string) =>
      deleteHighlight(session?.access_token ?? "", highlightId),
    onMutate: async (highlightId) => {
      await queryClient.cancelQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      const previous = queryClient.getQueriesData<WebHighlight[]>({
        queryKey: HIGHLIGHTS_QUERY_KEY,
      });
      queryClient.setQueriesData<WebHighlight[]>(
        { queryKey: HIGHLIGHTS_QUERY_KEY },
        (current) => current?.filter((highlight) => highlight.id !== highlightId),
      );
      return { previous };
    },
    onError: (_error, _highlightId, context) => {
      for (const [queryKey, value] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, value);
      }
    },
    onSuccess: () => {
      retryBookmarkCacheSync();
      void queryClient.invalidateQueries({ queryKey: ["resource-usage"] });
      void queryClient.invalidateQueries({ queryKey: ["account-plan"] });
      void queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });
}

export function useDeleteHighlights() {
  const { retryBookmarkCacheSync, session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (highlights: WebHighlight[]): Promise<HighlightBulkDeleteResult> => {
      const deletedIds: string[] = [];
      const failedIds: string[] = [];
      for (let offset = 0; offset < highlights.length; offset += HIGHLIGHT_DELETE_CONCURRENCY) {
        const batch = highlights.slice(offset, offset + HIGHLIGHT_DELETE_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((highlight) =>
            deleteHighlight(session?.access_token ?? "", highlight.id),
          ),
        );
        results.forEach((result, index) => {
          const highlightId = batch[index].id;
          if (result.status === "fulfilled") deletedIds.push(highlightId);
          else failedIds.push(highlightId);
        });
      }
      return { deletedIds, failedIds };
    },
    onMutate: async (highlights) => {
      await queryClient.cancelQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      const previous = queryClient.getQueriesData<WebHighlight[]>({
        queryKey: HIGHLIGHTS_QUERY_KEY,
      });
      const selectedIds = new Set(highlights.map((highlight) => highlight.id));
      queryClient.setQueriesData<WebHighlight[]>(
        { queryKey: HIGHLIGHTS_QUERY_KEY },
        (current) => current?.filter((highlight) => !selectedIds.has(highlight.id)),
      );
      return { previous };
    },
    onSuccess: ({ deletedIds, failedIds }, _highlights, context) => {
      if (failedIds.length) {
        const failedIdSet = new Set(failedIds);
        for (const [queryKey, previous] of context?.previous ?? []) {
          queryClient.setQueryData<WebHighlight[]>(queryKey, (current) => {
            const currentHighlights = current ?? [];
            const currentById = new Map(
              currentHighlights.map((highlight) => [highlight.id, highlight]),
            );
            const previousIds = new Set((previous ?? []).map((highlight) => highlight.id));
            const restored = (previous ?? []).flatMap((highlight) => {
              const currentHighlight = currentById.get(highlight.id);
              if (currentHighlight) return [currentHighlight];
              return failedIdSet.has(highlight.id) ? [highlight] : [];
            });
            return [
              ...restored,
              ...currentHighlights.filter((highlight) => !previousIds.has(highlight.id)),
            ];
          });
        }
      }
      if (deletedIds.length) {
        retryBookmarkCacheSync();
        void queryClient.invalidateQueries({ queryKey: ["resource-usage"] });
        void queryClient.invalidateQueries({ queryKey: ["account-plan"] });
        void queryClient.invalidateQueries({ queryKey: ["trash"] });
      }
    },
    onError: (_error, _highlights, context) => {
      for (const [queryKey, value] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, value);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });
}

export function useUpdateHighlightAnnotation() {
  const { session } = useAuth();
  const { encryptField } = useEncryption();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      highlight,
      note,
    }: {
      highlight: WebHighlight;
      note: string;
    }) => {
      const normalizedNote = normalizeHighlightAnnotation(note);
      const update = {
        encryptedAnnotation: normalizedNote
          ? await encryptField(normalizedNote)
          : null,
      };
      await updateHighlightAnnotation(
        session?.access_token ?? "",
        highlight.id,
        update,
      );
    },
    onMutate: async ({ highlight, note }) => {
      await queryClient.cancelQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      const previous = queryClient.getQueriesData<WebHighlight[]>({
        queryKey: HIGHLIGHTS_QUERY_KEY,
      });
      const normalizedNote = normalizeHighlightAnnotation(note);
      queryClient.setQueriesData<WebHighlight[]>(
        { queryKey: HIGHLIGHTS_QUERY_KEY },
        (current) => current?.map((item) => item.id === highlight.id
          ? { ...item, payload: { ...item.payload, note: normalizedNote } }
          : item),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, value] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, value);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });
}

export function useUpdateHighlightColor() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      highlight,
      color,
    }: {
      highlight: WebHighlight;
      color: WebHighlightPayload["color"];
    }) => {
      await updateHighlightColor(
        session?.access_token ?? "",
        highlight.id,
        { color },
      );
    },
    onMutate: async ({ highlight, color }) => {
      await queryClient.cancelQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      const previous = queryClient.getQueriesData<WebHighlight[]>({
        queryKey: HIGHLIGHTS_QUERY_KEY,
      });
      queryClient.setQueriesData<WebHighlight[]>(
        { queryKey: HIGHLIGHTS_QUERY_KEY },
        (current) => current?.map((item) => item.id === highlight.id
          ? { ...item, payload: { ...item.payload, color } }
          : item),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [queryKey, value] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, value);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
    },
  });
}
