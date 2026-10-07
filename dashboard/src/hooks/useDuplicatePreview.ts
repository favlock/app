import { useEffect, useState } from "react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { getCachedBookmarksForUser } from "../lib/bookmarkCache";
import {
  countDuplicateBookmarks,
  findBookmarkDuplicateGroupsInBatches,
  type BookmarkDuplicateGroup,
} from "../lib/bookmarkDuplicates";
import { readLocalBookmarks } from "../lib/localVault";

export type DuplicatePreview =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      scannedCount: number;
      duplicateCount: number;
      groups: BookmarkDuplicateGroup[];
    };

type DuplicatePreviewResult = Exclude<
  DuplicatePreview,
  { status: "unavailable" } | { status: "loading" }
>;

/**
 * Runs a one-off, in-memory duplicate scan so accounts without Pro can see
 * what the duplicate monitor would find. Nothing is persisted, scheduled, or
 * sent over the network; cleanup stays with the Pro monitor.
 */
export function useDuplicatePreview(enabled: boolean): DuplicatePreview {
  const {
    bookmarkCacheSyncedAt,
    bookmarkCacheSyncing,
    isLocalAccount,
    libraryCacheHydrating,
    user,
  } = useAuth();
  const { cryptoKey } = useEncryption();
  const userId = user?.id ?? null;
  const [result, setResult] = useState<{
    key: string;
    preview: DuplicatePreviewResult;
  } | null>(null);

  const canRead = Boolean(enabled && userId && cryptoKey);
  const isCacheReady = Boolean(
    bookmarkCacheSyncedAt && !bookmarkCacheSyncing && !libraryCacheHydrating,
  );
  const scanKey =
    canRead && isCacheReady
      ? `${userId}:${isLocalAccount ? "local" : "cloud"}:${bookmarkCacheSyncedAt}`
      : null;

  useEffect(() => {
    if (!scanKey || !userId || !cryptoKey) return;

    const controller = new AbortController();
    const scan = async () => {
      try {
        const bookmarks = (
          isLocalAccount
            ? await readLocalBookmarks(userId, cryptoKey)
            : await getCachedBookmarksForUser(userId)
        ).filter((bookmark) => !bookmark.is_highlight_source);
        const groups = await findBookmarkDuplicateGroupsInBatches(
          bookmarks,
          "tracking",
          () => undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({
          key: scanKey,
          preview: {
            status: "ready",
            scannedCount: bookmarks.length,
            duplicateCount: countDuplicateBookmarks(groups),
            groups,
          },
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResult({ key: scanKey, preview: { status: "error" } });
      }
    };

    void scan();
    return () => controller.abort();
  }, [cryptoKey, isLocalAccount, scanKey, userId]);

  if (!canRead) return { status: "unavailable" };
  if (!scanKey || result?.key !== scanKey) return { status: "loading" };
  return result.preview;
}
