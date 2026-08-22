import { useEffect, useMemo, useState } from "react";
import { SEARCH_ENGINES } from "../constants/searchEngines";
import {
  useUpdateSearchEngine,
  useUserInfo,
} from "../hooks/useUserInfoQuery";
import { useBookmarkStore } from "../store/bookmarkStore";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

interface SearchEnginePreferenceDialogProps {
  enabled?: boolean;
}

export default function SearchEnginePreferenceDialog({
  enabled = true,
}: SearchEnginePreferenceDialogProps) {
  const { data: userInfo, isSuccess } = useUserInfo();
  const updateSearchEngine = useUpdateSearchEngine();
  const { selectedEngine, setSelectedEngine } = useBookmarkStore();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectionSaved, setSelectionSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedEngine = useMemo(
    () =>
      SEARCH_ENGINES.find(
        (engine) => engine.slug === userInfo?.default_search_engine,
      ),
    [userInfo?.default_search_engine],
  );
  const chosenEngine =
    SEARCH_ENGINES.find((engine) => engine.slug === selectedSlug) ?? null;

  useEffect(() => {
    if (savedEngine && savedEngine.slug !== selectedEngine.slug) {
      setSelectedEngine(savedEngine);
    }
  }, [savedEngine, selectedEngine.slug, setSelectedEngine]);

  const saveSelection = () => {
    if (!chosenEngine) return;

    setSaveError(null);
    updateSearchEngine.mutate(chosenEngine.slug, {
      onSuccess: () => {
        setSelectedEngine(chosenEngine);
        setSelectionSaved(true);
      },
      onError: () => {
        setSaveError("Could not save your choice. Please try again.");
      },
    });
  };

  return (
    <Dialog
      open={enabled && isSuccess && !savedEngine && !selectionSaved}
      onClose={() => {}}
      size="lg"
    >
      <DialogTitle>Choose your favorite search engine</DialogTitle>
      <DialogDescription>
        Pick the search engine FavLock should use by default. You can change
        it anytime from the search bar.
      </DialogDescription>

      <DialogBody>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          aria-label="Search engines"
          role="group"
        >
          {SEARCH_ENGINES.map((engine) => {
            const isSelected = engine.slug === chosenEngine?.slug;

            return (
              <button
                key={engine.slug}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedSlug(engine.slug);
                  setSaveError(null);
                }}
                disabled={updateSearchEngine.isPending}
                className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 text-sm font-semibold transition ${
                  isSelected
                    ? "border-[var(--app-primary)] bg-[color-mix(in_oklab,var(--app-primary)_10%,white)] text-[var(--app-ink)] ring-2 ring-[var(--app-primary)]/20"
                    : "border-zinc-950/10 bg-white text-zinc-700 hover:border-[var(--app-primary)]/45 hover:bg-zinc-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <img src={engine.logo} alt="" className="size-8" />
                <span>{engine.name}</span>
              </button>
            );
          })}
        </div>

        {saveError ? (
          <p
            className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600"
            role="alert"
          >
            {saveError}
          </p>
        ) : null}
      </DialogBody>

      <DialogActions>
        <Button
          type="button"
          color="emerald"
          onClick={saveSelection}
          disabled={!chosenEngine || updateSearchEngine.isPending}
        >
          {updateSearchEngine.isPending
            ? "Saving..."
            : chosenEngine
              ? `Use ${chosenEngine.name}`
              : "Choose a search engine"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
