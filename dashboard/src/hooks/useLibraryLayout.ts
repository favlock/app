import { useEffect, useState } from "react";

export type LibraryLayout = "cards" | "compact";

const NARROW_VIEWPORT = "(max-width: 639px)";

function storedLayout(key: string, narrow: boolean, wideDefault: LibraryLayout): LibraryLayout {
  try {
    const value = window.localStorage.getItem(`${key}:${narrow ? "narrow" : "wide"}`);
    if (value === "cards" || value === "compact") return value;
  } catch {
    // The layout remains usable when browser storage is unavailable.
  }
  return narrow ? "compact" : wideDefault;
}

export function useLibraryLayout(userId: string | undefined, wideDefault: LibraryLayout = "cards") {
  const key = `favlock.library-layout.v1:${userId ?? "anonymous"}`;
  const [narrow, setNarrow] = useState(() =>
    typeof window.matchMedia === "function" && window.matchMedia(NARROW_VIEWPORT).matches,
  );
  const [choice, setChoice] = useState(() => ({ key, narrow, layout: storedLayout(key, narrow, wideDefault) }));
  const layout = choice.key === key && choice.narrow === narrow
    ? choice.layout
    : storedLayout(key, narrow, wideDefault);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(NARROW_VIEWPORT);
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const update = (next: LibraryLayout) => {
    setChoice({ key, narrow, layout: next });
    try {
      window.localStorage.setItem(`${key}:${narrow ? "narrow" : "wide"}`, next);
    } catch {
      // The choice still works for this visit.
    }
  };

  return { layout, update };
}
