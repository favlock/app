import { useState } from "react";

export type SidebarSection = "collections" | "tags";

type SectionExpansion = Record<SidebarSection, boolean>;

const COLLAPSED: SectionExpansion = { collections: false, tags: false };

function storedExpansion(key: string): SectionExpansion {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (value && typeof value === "object") {
      return {
        collections: value.collections === true,
        tags: value.tags === true,
      };
    }
  } catch {
    // The sidebar remains usable when browser storage is unavailable.
  }
  return COLLAPSED;
}

export function useSidebarSectionExpansion(userId: string | undefined) {
  const key = `favlock.sidebar-sections.v1:${userId ?? "anonymous"}`;
  const [choice, setChoice] = useState(() => ({
    key,
    expansion: storedExpansion(key),
  }));
  const expansion =
    choice.key === key ? choice.expansion : storedExpansion(key);

  const setExpanded = (section: SidebarSection, expanded: boolean) => {
    const next = { ...expansion, [section]: expanded };
    setChoice({ key, expansion: next });
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // The choice still works for this visit.
    }
  };

  return { expansion, setExpanded };
}
