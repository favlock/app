import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, Sparkles } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { RESOURCE_USAGE_QUERY_KEY } from "../hooks/useResourceUsageQuery";
import {
  countDuplicateBookmarks,
  findBookmarkDuplicateGroups,
  type BookmarkDuplicateGroup,
  type DuplicateBookmarkCandidate,
} from "../lib/bookmarkDuplicates";
import { ENC_PREFIX } from "../lib/encryption";
import { cleanupDuplicateBookmarks } from "../lib/bookmarkRepository";
import { getCachedBookmarksForUser } from "../lib/bookmarkCache";
import { Button } from "./ui/button";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/fieldset";

type CleanupStatus =
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function BookmarkDuplicateCleanupSection() {
  const { user, session, retryBookmarkCacheSync } = useAuth();
  const { cryptoKey, decryptField, keyLoading, triggerUnlock } = useEncryption();
  const queryClient = useQueryClient();
  const [groups, setGroups] = useState<BookmarkDuplicateGroup[] | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [status, setStatus] = useState<CleanupStatus | null>(null);

  const scanForDuplicates = async () => {
    if (!user) return;

    setIsScanning(true);
    setStatus(null);

    try {
      const data = (await getCachedBookmarksForUser(user.id)).filter(
        (bookmark) => !bookmark.is_highlight_source,
      );

      if (
        !cryptoKey &&
        data.some((row) => row.url.startsWith(ENC_PREFIX))
      ) {
        triggerUnlock();
        setStatus({
          type: "error",
          message: "Unlock your encrypted library, then scan again.",
        });
        return;
      }

      const decryptedBookmarks: DuplicateBookmarkCandidate[] = await Promise.all(
        data.map(async (row) => ({
          id: row.id,
          title: await decryptField(row.title),
          url: await decryptField(row.url),
          created_at: row.created_at,
        })),
      );
      const duplicateGroups = findBookmarkDuplicateGroups(decryptedBookmarks);

      if (duplicateGroups.length === 0) {
        setGroups(null);
        setSelectedUrls(new Set());
        setStatus({
          type: "success",
          message: "No duplicate bookmark URLs found.",
        });
        return;
      }

      setGroups(duplicateGroups);
      setSelectedUrls(
        new Set(duplicateGroups.map((group) => group.normalizedUrl)),
      );
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not scan bookmarks for duplicates.",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const toggleGroup = (normalizedUrl: string, selected: boolean) => {
    setSelectedUrls((current) => {
      const next = new Set(current);
      if (selected) next.add(normalizedUrl);
      else next.delete(normalizedUrl);
      return next;
    });
  };

  const selectedGroups =
    groups?.filter((group) => selectedUrls.has(group.normalizedUrl)) ?? [];
  const selectedDuplicateCount = countDuplicateBookmarks(selectedGroups);

  const cleanupSelectedDuplicates = async () => {
    if (selectedGroups.length === 0) return;

    setIsCleaning(true);
    setStatus(null);

    try {
      const removedCount = await cleanupDuplicateBookmarks(
        session?.access_token ?? "",
        selectedGroups.map((group) => ({
          survivorId: group.keeper.id,
          duplicateIds: group.duplicates.map((bookmark) => bookmark.id),
        })),
      );
      setGroups(null);
      setSelectedUrls(new Set());
      setStatus({
        type: "success",
        message: `${removedCount} duplicate ${removedCount === 1 ? "bookmark" : "bookmarks"} removed.`,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["tag-bookmark-ids"] }),
        queryClient.invalidateQueries({ queryKey: ["folders"] }),
        queryClient.invalidateQueries({ queryKey: RESOURCE_USAGE_QUERY_KEY }),
      ]);
      retryBookmarkCacheSync();
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not clean up duplicate bookmarks.",
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <section className="border-t border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] pt-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold liquid-ink">
            <Copy className="size-4" aria-hidden="true" />
            Duplicate cleanup
          </h3>
          <p className="mt-1 text-sm leading-6 liquid-muted">
            Find bookmarks with the same URL and remove extra copies. You can
            review every match before anything is deleted.
          </p>
        </div>
        <Button
          type="button"
          outline
          className="flex-none gap-2 whitespace-nowrap"
          disabled={isScanning || isCleaning || keyLoading}
          onClick={() => void scanForDuplicates()}
        >
          {isScanning ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {isScanning ? "Scanning..." : "Scan duplicates"}
        </Button>
      </div>

      {status ? (
        <div
          role={status.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            status.type === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-600"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
          }`}
        >
          {status.type === "success" ? (
            <Check className="mt-0.5 size-4 flex-none" aria-hidden="true" />
          ) : null}
          <p>{status.message}</p>
        </div>
      ) : null}

      <Dialog
        open={Boolean(groups)}
        onClose={isCleaning ? () => {} : () => setGroups(null)}
        size="2xl"
      >
        <DialogTitle>Review duplicate bookmarks</DialogTitle>
        <DialogDescription>
          Select the duplicate groups to clean. FavLock keeps the oldest copy
          and combines tags, favorite status, and a collection when the keeper
          does not already have one.
        </DialogDescription>

        {groups ? (
          <div className="mt-5 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {groups.map((group) => (
              <CheckboxField
                key={group.normalizedUrl}
                className="rounded-xl border border-gray-200 bg-gray-50/70 p-4"
              >
                <Checkbox
                  color="emerald"
                  checked={selectedUrls.has(group.normalizedUrl)}
                  disabled={isCleaning}
                  onChange={(selected) =>
                    toggleGroup(group.normalizedUrl, selected)
                  }
                />
                <Label className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900">
                    {group.keeper.title || group.normalizedUrl}
                  </span>
                  <span className="mt-1 block break-all text-xs font-normal text-gray-500">
                    {group.normalizedUrl}
                  </span>
                  <span className="mt-2 block text-xs font-medium text-amber-700">
                    {group.duplicates.length} extra{" "}
                    {group.duplicates.length === 1 ? "copy" : "copies"}
                  </span>
                </Label>
              </CheckboxField>
            ))}
          </div>
        ) : null}

        <DialogActions>
          <Button
            type="button"
            outline
            disabled={isCleaning}
            onClick={() => setGroups(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            color="red"
            disabled={isCleaning || selectedDuplicateCount === 0}
            onClick={() => void cleanupSelectedDuplicates()}
          >
            {isCleaning
              ? "Cleaning up..."
              : `Remove ${selectedDuplicateCount} ${
                  selectedDuplicateCount === 1 ? "duplicate" : "duplicates"
                }`}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
