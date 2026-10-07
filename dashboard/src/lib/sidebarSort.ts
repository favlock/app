import type { Folder, Tag } from "../types/bookmark";
import { sortFolders } from "./folderOrder";

export const SIDEBAR_SORT_MODES = ["name", "count", "custom"] as const;

export type SidebarSortMode = (typeof SIDEBAR_SORT_MODES)[number];
export type SidebarSortSection = "collections" | "tags";

export const SIDEBAR_SORT_STORAGE_KEYS: Record<SidebarSortSection, string> = {
  collections: "favlock.sidebar-sort.collections",
  tags: "favlock.sidebar-sort.tags",
};

/** Matches the order each section used before sorting was configurable. */
const DEFAULT_SIDEBAR_SORT: Record<SidebarSortSection, SidebarSortMode> = {
  collections: "custom",
  tags: "name",
};

export const SIDEBAR_SORT_LABELS: Record<SidebarSortMode, string> = {
  name: "Name",
  count: "Most items",
  custom: "Custom order",
};

const listeners = new Set<() => void>();
const cachedModes: Partial<Record<SidebarSortSection, SidebarSortMode>> = {};

export function parseSidebarSortMode(
  section: SidebarSortSection,
  value: string | null,
): SidebarSortMode {
  return (
    SIDEBAR_SORT_MODES.find((mode) => mode === value) ??
    DEFAULT_SIDEBAR_SORT[section]
  );
}

function readSidebarSortMode(section: SidebarSortSection): SidebarSortMode {
  try {
    return parseSidebarSortMode(
      section,
      localStorage.getItem(SIDEBAR_SORT_STORAGE_KEYS[section]),
    );
  } catch {
    return DEFAULT_SIDEBAR_SORT[section];
  }
}

export function getSidebarSortMode(
  section: SidebarSortSection,
): SidebarSortMode {
  cachedModes[section] ??= readSidebarSortMode(section);
  return cachedModes[section];
}

export function setSidebarSortMode(
  section: SidebarSortSection,
  mode: SidebarSortMode,
) {
  cachedModes[section] = mode;
  try {
    localStorage.setItem(SIDEBAR_SORT_STORAGE_KEYS[section], mode);
  } catch {
    // Keep the selection usable for this session when storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSidebarSortMode(listener: () => void) {
  const storageKeys = Object.values(SIDEBAR_SORT_STORAGE_KEYS);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && !storageKeys.includes(event.key)) return;
    delete cachedModes.collections;
    delete cachedModes.tags;
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

type Counts = Readonly<Record<string, number>>;

function compareByName(left: { name: string }, right: { name: string }) {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function comparator<T extends { id: string; name: string }>(
  mode: Exclude<SidebarSortMode, "custom">,
  counts: Counts,
) {
  return mode === "name"
    ? compareByName
    : (left: T, right: T) =>
        (counts[right.id] ?? 0) - (counts[left.id] ?? 0) ||
        compareByName(left, right);
}

/**
 * Orders collections for the sidebar. Subcollections always follow their
 * parent and are sorted among their siblings with the same mode.
 */
export function sortSidebarFolders(
  folders: Folder[],
  mode: SidebarSortMode,
  counts: Counts,
): Folder[] {
  const hierarchy = sortFolders(folders);
  if (mode === "custom") return hierarchy;

  const compare = comparator<Folder>(mode, counts);
  const children = new Map<string, Folder[]>();
  const roots: Folder[] = [];
  for (const folder of hierarchy) {
    const isChild =
      folder.parent_id !== null &&
      hierarchy.some(
        (parent) => parent.id === folder.parent_id && parent.parent_id === null,
      );
    if (isChild) {
      children.set(folder.parent_id!, [
        ...(children.get(folder.parent_id!) ?? []),
        folder,
      ]);
    } else {
      roots.push(folder);
    }
  }
  return [...roots]
    .sort(compare)
    .flatMap((root) => [root, ...[...(children.get(root.id) ?? [])].sort(compare)]);
}

export function sortTagsByCustomOrder(tags: Tag[]): Tag[] {
  return [...tags].sort(
    (left, right) =>
      (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
      compareByName(left, right),
  );
}

export function sortSidebarTags(
  tags: Tag[],
  mode: SidebarSortMode,
  counts: Counts,
): Tag[] {
  return mode === "custom"
    ? sortTagsByCustomOrder(tags)
    : [...tags].sort(comparator<Tag>(mode, counts));
}

/** Moves a tag to `index` and renumbers the custom order from zero. */
export function placeTag(tags: Tag[], tagId: string, index: number): Tag[] {
  const ordered = sortTagsByCustomOrder(tags);
  const from = ordered.findIndex(({ id }) => id === tagId);
  if (from !== -1) {
    const [tag] = ordered.splice(from, 1);
    ordered.splice(Math.max(0, Math.min(index, ordered.length)), 0, tag);
  }
  return ordered.map((tag, sortOrder) => ({ ...tag, sort_order: sortOrder }));
}

export function buildTagPlacements(
  tags: Tag[],
): Array<{ id: string; sortOrder: number }> {
  return sortTagsByCustomOrder(tags).map((tag, sortOrder) => ({
    id: tag.id,
    sortOrder,
  }));
}
