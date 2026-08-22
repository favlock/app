import { useState } from "react";
import { Database, HardDrive, LockKeyhole } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import {
  clearBookmarkCacheForUser,
  clearLibraryContentCacheForUser,
} from "../lib/bookmarkCache";
import { clearLocalSearchHistoryForUser } from "../lib/searchHistory";
import { Button } from "./ui/button";
import { Description, Label } from "./ui/fieldset";
import { Switch, SwitchField } from "./ui/switch";
import { Text } from "./ui/text";
import ConfirmDialog from "./ConfirmDialog";

type PrivacyStatus = {
  type: "error" | "info" | "success";
  message: string;
};

export default function LocalPrivacySection() {
  const { user } = useAuth();
  const {
    clearKey,
    cryptoKey,
    keyLoading,
    keyRemembered,
    setKeyRemembered,
    triggerUnlock,
  } = useEncryption();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<PrivacyStatus | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const updateRememberedState = async (rememberDevice: boolean) => {
    setStatus(null);

    if (!cryptoKey) {
      triggerUnlock();
      setStatus({
        type: "info",
        message: "Unlock this browser before changing key storage.",
      });
      return;
    }

    setBusy(true);
    try {
      await setKeyRemembered(rememberDevice);
      setStatus({
        type: "success",
        message: rememberDevice
          ? "This browser will unlock automatically on your next visit."
          : "The saved key was removed. This page stays unlocked until it is refreshed.",
      });
    } catch {
      setStatus({
        type: "error",
        message: "Could not update key storage on this browser.",
      });
    } finally {
      setBusy(false);
    }
  };

  const lockAndClear = async () => {
    if (!user) return;

    setConfirmingClear(false);
    setBusy(true);
    setStatus(null);
    queryClient.clear();
    clearLocalSearchHistoryForUser(user.id);

    const results = await Promise.allSettled([
      clearKey(),
      clearBookmarkCacheForUser(user.id),
      clearLibraryContentCacheForUser(user.id),
    ]);
    const failed = results.some((result) => result.status === "rejected");

    setBusy(false);
    setStatus(
      failed
        ? {
            type: "error",
            message:
              "FavLock locked, but some browser storage could not be cleared. Clear this site's data in your browser settings.",
          }
        : {
            type: "success",
            message: "Encryption key and local library data cleared.",
          },
    );
    triggerUnlock();
  };

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white/80 p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <LockKeyhole className="size-4 text-gray-500" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-900">Local privacy</h3>
      </div>
      <Text className="mt-1 text-sm text-gray-600">
        Control what FavLock keeps in this browser profile.
      </Text>

      <SwitchField className="mt-5">
        <Label>Remember the encryption key</Label>
        <Description>
          When enabled, the key is stored in IndexedDB and loaded automatically
          on future visits. Keep this disabled on shared devices.
        </Description>
        <Switch
          color="emerald"
          checked={keyRemembered}
          onChange={(checked) => void updateRememberedState(checked)}
          disabled={busy || keyLoading}
        />
      </SwitchField>

      <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4">
        <div className="flex gap-3">
          <Database
            className="mt-0.5 size-4 flex-none text-amber-700"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Local search uses decrypted data
            </p>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              Decrypted bookmarks, notes, tasks, Readspace items, collections,
              tags, and Trash summaries are stored in a local IndexedDB library
              cache on this browser. It is cleared when you sign out or use the
              action below.
            </p>
          </div>
        </div>
      </div>

      {status ? (
        <div
          role="status"
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            status.type === "error"
              ? "bg-red-500/10 text-red-600"
              : status.type === "success"
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-sky-500/10 text-sky-600"
          }`}
        >
          {status.message}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 border-t border-gray-200/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <HardDrive
            className="mt-0.5 size-4 flex-none text-gray-500"
            aria-hidden="true"
          />
          <p className="text-sm text-gray-600">
            Remove the saved key and decrypted search index without signing out.
          </p>
        </div>
        <Button
          type="button"
          outline
          disabled={busy || keyLoading}
          onClick={() => setConfirmingClear(true)}
          className="flex-none cursor-pointer whitespace-nowrap"
        >
          {busy ? "Working..." : "Lock & clear local data"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingClear}
        title="Lock and clear local data"
        description="Remove the saved encryption key and decrypted search index from this browser? You will need your key to unlock again."
        confirmLabel="Lock & clear"
        busyLabel="Clearing..."
        busy={busy}
        onClose={() => setConfirmingClear(false)}
        onConfirm={() => void lockAndClear()}
      />
    </section>
  );
}
