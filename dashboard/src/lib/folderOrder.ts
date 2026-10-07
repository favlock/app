import type { Folder } from "../types/bookmark";

export interface FolderPlacement {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

const ROOT_GROUP = "__root__";
const groupKey = (parentId: string | null) => parentId ?? ROOT_GROUP;

function sortSiblings(folders: Folder[]): Folder[] {
  return [...folders].sort(
    (left, right) =>
      (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
      left.name.localeCompare(right.name),
  );
}

export function sortFolders(folders: Folder[]): Folder[] {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const roots = sortSiblings(
    folders.filter((folder) => {
      if (!folder.parent_id) return true;
      const parent = folderById.get(folder.parent_id);
      return !parent || parent.parent_id !== null;
    }),
  );

  return roots.flatMap((root) => [
    root,
    ...sortSiblings(
      folders.filter((folder) => folder.parent_id === root.id),
    ),
  ]);
}

export function buildFolderPlacements(folders: Folder[]): FolderPlacement[] {
  const nextPositionByGroup = new Map<string, number>();

  return sortFolders(folders).map((folder) => {
    const key = groupKey(folder.parent_id);
    const sortOrder = nextPositionByGroup.get(key) ?? 0;
    nextPositionByGroup.set(key, sortOrder + 1);
    return { id: folder.id, parentId: folder.parent_id, sortOrder };
  });
}

export function applyFolderPlacements(
  folders: Folder[],
  placements: FolderPlacement[],
): Folder[] {
  const placementById = new Map(
    placements.map((placement) => [placement.id, placement]),
  );

  return sortFolders(
    folders.map((folder) => {
      const placement = placementById.get(folder.id);
      return placement
        ? {
            ...folder,
            parent_id: placement.parentId,
            sort_order: placement.sortOrder,
          }
        : folder;
    }),
  );
}

function siblingGroups(folders: Folder[]): Map<string, Folder[]> {
  const groups = new Map<string, Folder[]>();
  for (const folder of sortFolders(folders)) {
    const key = groupKey(folder.parent_id);
    groups.set(key, [...(groups.get(key) ?? []), folder]);
  }
  return groups;
}

/** Ordered siblings of a collection, including the collection itself. */
export function folderSiblings(folders: Folder[], folderId: string): Folder[] {
  const folder = folders.find(({ id }) => id === folderId);
  if (!folder) return [];
  return siblingGroups(folders).get(groupKey(folder.parent_id)) ?? [];
}

/**
 * Collections that `folderId` may be moved into. Nesting is one level deep,
 * so a collection with subcollections cannot become a subcollection.
 */
export function nestTargets(folders: Folder[], folderId: string): Folder[] {
  const folder = folders.find(({ id }) => id === folderId);
  if (!folder || folders.some(({ parent_id }) => parent_id === folderId)) {
    return [];
  }
  return sortFolders(folders).filter(
    (candidate) =>
      candidate.parent_id === null &&
      candidate.id !== folderId &&
      candidate.id !== folder.parent_id,
  );
}

/**
 * Moves a collection to `index` among the children of `parentId` (or the top
 * level) and renumbers every sibling group. Invalid moves return the input
 * order unchanged.
 */
export function placeFolder(
  folders: Folder[],
  folderId: string,
  parentId: string | null,
  index: number,
): Folder[] {
  const folder = folders.find(({ id }) => id === folderId);
  const parent = parentId
    ? folders.find(({ id }) => id === parentId)
    : undefined;
  const changesParent = folder?.parent_id !== parentId;
  if (
    !folder ||
    (parentId !== null && (!parent || parent.parent_id !== null)) ||
    parentId === folderId ||
    (changesParent &&
      parentId !== null &&
      folders.some(({ parent_id }) => parent_id === folderId))
  ) {
    return sortFolders(folders);
  }

  const groups = siblingGroups(folders);
  const sourceKey = groupKey(folder.parent_id);
  groups.set(
    sourceKey,
    (groups.get(sourceKey) ?? []).filter(({ id }) => id !== folderId),
  );
  const target = [...(groups.get(groupKey(parentId)) ?? [])];
  const boundedIndex = Math.max(0, Math.min(index, target.length));
  target.splice(boundedIndex, 0, { ...folder, parent_id: parentId });
  groups.set(groupKey(parentId), target);

  const placements: FolderPlacement[] = [];
  for (const siblings of groups.values()) {
    siblings.forEach((sibling, sortOrder) => {
      placements.push({
        id: sibling.id,
        parentId: sibling.parent_id,
        sortOrder,
      });
    });
  }
  return applyFolderPlacements(folders, placements);
}
