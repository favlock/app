import { Cloud, HardDrive, ArrowDownWideNarrow } from "lucide-react";
import { useSortPreferenceSync } from "../hooks/useSortPreferenceSync";
import { Button } from "./ui/button";

export default function SortStoragePreference() {
  const sorting = useSortPreferenceSync();
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-[var(--app-line)]/20 bg-[var(--app-highlight)]/80 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold liquid-ink">
        <ArrowDownWideNarrow className="size-4" aria-hidden="true" /> Sorting preferences
      </h3>
      <p className="mt-1 text-sm liquid-muted">Choose where FavLock saves your sort order and bookmark filters.</p>
      <fieldset className="mt-5" disabled={sorting.busy || !sorting.modeReady}>
        <legend className="sr-only">Sorting storage</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["local", "cloud"] as const).map((mode) => {
            const selected = sorting.cloudMode === (mode === "cloud");
            const disabled = mode === "cloud" && !sorting.canSync;
            const Icon = mode === "cloud" ? Cloud : HardDrive;
            return (
              <label key={mode} className={`relative flex flex-col rounded-xl border p-4 focus-within:outline-2 focus-within:outline-[var(--app-primary)] ${selected ? "border-[var(--app-primary)] bg-[color-mix(in_oklab,var(--app-primary)_8%,var(--app-highlight))]" : "border-[var(--app-line)]/20"} ${disabled ? "opacity-60" : "cursor-pointer"}`}>
                <input type="radio" name="sort-storage" checked={selected} disabled={disabled} onChange={() => sorting.setMode(mode)} className="sr-only" />
                <span className="flex items-center gap-2 text-sm font-semibold liquid-ink"><Icon className="size-4" aria-hidden="true" />{mode === "cloud" ? "Cloud · Pro" : "On this device"}</span>
                <span className="mt-2 text-sm liquid-muted">{mode === "cloud" ? "Use the same sorting across your devices." : "Keep sorting only in this browser."}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="mt-4 text-sm liquid-muted">
        {sorting.isLocalAccount
          ? "Local vaults save sorting on this device. Cloud sync requires a Pro cloud account."
          : sorting.cloudMode && !sorting.canSync
            ? "Cloud sorting is paused because it requires Pro. Sorting changes stay on this device. Choose On this device to remove the previous cloud copy."
            : "Cloud mode syncs only your display preferences. Switching to On this device keeps your current sorting and removes the cloud copy."}
      </p>
      {sorting.error && <div role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">
        <p>{sorting.error.message}</p>
        <Button outline className="mt-2" onClick={sorting.reload}>Reload cloud settings</Button>
      </div>}
    </section>
  );
}
