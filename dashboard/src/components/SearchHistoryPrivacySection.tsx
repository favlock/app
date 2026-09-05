import { useState } from "react";
import { Ban, Cloud, HardDrive, History, LockKeyhole } from "lucide-react";
import { useSearchHistory } from "../hooks/useSearchHistory";
import { useUpdateSearchHistoryMode } from "../hooks/useSearchHistoryMode";
import type { SearchHistoryMode } from "../lib/searchHistory";
import { Button } from "./ui/button";
import ConfirmDialog from "./ConfirmDialog";

type PrivacyStatus = {
  type: "error" | "success";
  message: string;
};

const modes: Array<{
  value: SearchHistoryMode;
  label: string;
  description: string;
  icon: typeof Cloud;
}> = [
  {
    value: "cloud",
    label: "Cloud",
    description: "Sync your recent searches on all your devices.",
    icon: Cloud,
  },
  {
    value: "local",
    label: "Local",
    description: "Keep search history only in this browser.",
    icon: HardDrive,
  },
  {
    value: "off",
    label: "Off",
    description: "Disable search history and remove all saved searches.",
    icon: Ban,
  },
];

export default function SearchHistoryPrivacySection() {
  const { entries, mode, clearHistory } = useSearchHistory();
  const updateMode = useUpdateSearchHistoryMode();
  const [status, setStatus] = useState<PrivacyStatus | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const selectMode = async (nextMode: SearchHistoryMode) => {
    if (nextMode === mode || updateMode.isPending) return;
    setStatus(null);

    try {
      await updateMode.mutateAsync({ currentMode: mode, nextMode });
      setStatus({
        type: "success",
        message:
          nextMode === "cloud"
            ? "Search history will now sync securely across your devices."
            : nextMode === "local"
              ? "Search history is now stored only in this browser."
              : "Search history is disabled and saved searches were removed.",
      });
    } catch {
      setStatus({
        type: "error",
        message: "Could not update search history privacy. Please try again.",
      });
    }
  };

  const clear = async () => {
    setConfirmingClear(false);
    setClearing(true);
    setStatus(null);
    try {
      await clearHistory();
      setStatus({ type: "success", message: "Search history cleared." });
    } catch {
      setStatus({
        type: "error",
        message: "Could not clear all search history. Please try again.",
      });
    } finally {
      setClearing(false);
    }
  };

  const busy = clearing || updateMode.isPending;

  return (
    <section className="rounded-2xl border border-gray-200/80 dark:border-[var(--app-line)]/20 bg-[var(--app-highlight)]/80 p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <History className="size-4 text-gray-500 dark:text-[var(--app-muted)]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">Search history</h3>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-[var(--app-muted)]">
        Choose where FavLock keeps your 10 most recent searches for
        autocomplete.
      </p>

      <fieldset className="mt-5" disabled={busy}>
        <legend className="sr-only">Search history storage</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {modes.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.value;
            return (
              <label
                key={option.value}
                className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition-colors ${
                  selected
                    ? "border-[var(--app-primary)] bg-[color-mix(in_oklab,var(--app-primary)_8%,var(--app-highlight))] shadow-sm"
                    : "border-gray-200 dark:border-[var(--app-line)]/20 bg-[var(--app-highlight)]/70 hover:border-gray-300 hover:dark:border-[var(--app-line)]/20"
                } ${busy ? "cursor-wait opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="search-history-mode"
                  value={option.value}
                  checked={selected}
                  onChange={() => void selectMode(option.value)}
                  className="sr-only"
                />
                <div className="flex items-center gap-2">
                  <Icon
                    className={`size-4 ${selected ? "text-[var(--app-primary)]" : "text-gray-500 dark:text-[var(--app-muted)]"}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">
                    {option.label}
                  </span>
                </div>
                <span className="mt-2 text-sm leading-5 text-gray-600 dark:text-[var(--app-muted)]">
                  {option.description}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-4">
        <LockKeyhole
          className="mt-0.5 size-4 flex-none text-emerald-700 dark:text-emerald-300"
          aria-hidden="true"
        />
        <p className="text-sm leading-6 text-gray-600 dark:text-[var(--app-muted)]">
          Search history is encrypted with your FavLock key before it is saved.
          In Cloud mode, the server never receives your searches in plaintext.
        </p>
      </div>

      {status ? (
        <div
          role="status"
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            status.type === "error"
              ? "bg-red-500/10 text-red-600 dark:text-red-300"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
          }`}
        >
          {status.message}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 border-t border-gray-200/80 dark:border-[var(--app-line)]/20 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-[var(--app-muted)]">
          {entries.length > 0
            ? `${entries.length} saved ${entries.length === 1 ? "search" : "searches"}`
            : "No saved searches"}
        </p>
        <Button
          type="button"
          outline
          disabled={busy || entries.length === 0}
          onClick={() => setConfirmingClear(true)}
          className="flex-none cursor-pointer whitespace-nowrap"
        >
          {clearing ? "Clearing..." : "Clear history"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingClear}
        title="Clear search history"
        description="Remove all encrypted search history from this browser and the cloud? This cannot be undone."
        confirmLabel="Clear history"
        busyLabel="Clearing..."
        busy={clearing}
        onClose={() => setConfirmingClear(false)}
        onConfirm={() => void clear()}
      />
    </section>
  );
}
