import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogActions, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { PRESET_COLORS, getColorHex, type ColorConstant } from "../constants/colors";
import { SMART_VIEW_ICONS } from "../constants/smartViewIcons";
import type { LibrarySearchFilters } from "../lib/librarySearchFilters";
import { useSavedSmartViews } from "../hooks/useSavedSmartViews";
import type { SavedSmartView } from "../lib/savedSmartViews";

export default function SaveSmartViewDialog({ open, onClose, query, filters, view }: {
  open: boolean;
  onClose: () => void;
  query: string;
  filters: LibrarySearchFilters;
  view?: SavedSmartView;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("sparkles");
  const [color, setColor] = useState<ColorConstant>("BLUE");
  const [error, setError] = useState<string | null>(null);
  const { create, update, creating, updating } = useSavedSmartViews();
  const busy = creating || updating;

  useEffect(() => {
    if (!open) return;
    setName(view?.name ?? "");
    setIcon(view?.icon ?? "sparkles");
    setColor(view?.color ?? "BLUE");
    setError(null);
  }, [open, view?.id, view?.name, view?.icon, view?.color]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setError(null);
    try {
      if (view) {
        await update({ view, appearance: { name: name.trim(), icon, color } });
      } else {
        await create({ name: name.trim(), icon, color, query: query.trim(), filters });
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save Smart View.");
    }
  };

  return <Dialog open={open} onClose={onClose} size="lg">
    <DialogTitle>{view ? "Edit Smart View" : "Save Smart View"}</DialogTitle>
    <DialogDescription>{view ? "Change this view’s name, icon, or color." : "Keep this search and its filters in your sidebar."}</DialogDescription>
    <form onSubmit={submit} className="mt-5 space-y-5">
      <label className="block text-sm font-medium text-[var(--app-ink)]">
        Name
        <input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Design inspiration"
          className="mt-2 min-h-11 w-full rounded-lg border border-[var(--app-line)] bg-[var(--app-card)] px-3 text-[var(--app-ink)] focus:outline-2 focus:outline-[var(--app-primary)]" />
      </label>
      <fieldset>
        <legend className="text-sm font-medium text-[var(--app-ink)]">Icon</legend>
        <div className="mt-2 grid max-h-48 grid-cols-7 gap-1 overflow-y-auto rounded-xl border border-[var(--app-line)] p-2 sm:grid-cols-10">
          {SMART_VIEW_ICONS.map(({ id, label, Icon }) => <button key={id} type="button"
            aria-label={label} aria-pressed={icon === id} title={label} onClick={() => setIcon(id)}
            className={`flex size-10 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--app-primary)] ${icon === id ? "bg-[var(--app-primary)] text-[var(--app-on-primary)]" : "hover:bg-[var(--app-highlight)]"}`}>
            <Icon size={19} aria-hidden="true" />
          </button>)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-[var(--app-ink)]">Color</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESET_COLORS.map((value) => <button key={value} type="button" aria-label={value === "NONE" ? "Neutral" : value.toLowerCase()}
            aria-pressed={color === value} title={value === "NONE" ? "Neutral" : value.toLowerCase()}
            onClick={() => setColor(value)}
            className={`size-9 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] ${color === value ? "border-[var(--app-ink)]" : "border-transparent"}`}>
            <span className="block size-full rounded-full border border-[var(--app-line)]" style={{ background: getColorHex(value) }} />
          </button>)}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <DialogActions>
        <Button type="button" outline onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!name.trim() || busy}>{busy ? "Saving…" : view ? "Save changes" : "Save view"}</Button>
      </DialogActions>
    </form>
  </Dialog>;
}
