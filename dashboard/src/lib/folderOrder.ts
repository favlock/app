import { arrayMove } from "@dnd-kit/sortable";
import type { Folder } from "../types/bookmark";

export interface FolderPlacement {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

export type FolderDragAction = "nest" | "unnest" | "reorder" | "blocked";

export interface FolderDragIntent {
  action: FolderDragAction;
  activeId: string;
  overId: string;
  nextParentId: string | null;
  targetParentId: string | null;
  message?: string;
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

export function resolveFolderDragIntent(
  folders: Folder[],
  activeId: string,
  overId: string,
  deltaX: number,
  nestingThreshold: number,
): FolderDragIntent | null {
  const active = folders.find((folder) => folder.id === activeId);
  const over = folders.find((folder) => folder.id === overId);
  if (!active || !over) return null;

  if (deltaX >= nestingThreshold) {
    const hasChildren = folders.some(
      (folder) => folder.parent_id === active.id,
    );
    if (hasChildren) {
      return {
        action: "blocked",
        activeId,
        overId,
        nextParentId: active.parent_id,
        targetParentId: null,
        message: "Move its subcollections out before nesting this collection.",
      };
    }

    const targetParentId = over.parent_id ?? over.id;
    if (targetParentId === active.id) {
      return {
        action: "blocked",
        activeId,
        overId,
        nextParentId: active.parent_id,
        targetParentId: null,
        message: "Drag over another collection to create a subcollection.",
      };
    }

    return {
      action: targetParentId === active.parent_id ? "reorder" : "nest",
      activeId,
      overId,
      nextParentId: targetParentId,
      targetParentId,
    };
  }

  if (deltaX <= -nestingThreshold && active.parent_id !== null) {
    return {
      action: "unnest",
      activeId,
      overId: over.parent_id ?? over.id,
      nextParentId: null,
      targetParentId: null,
    };
  }

  if (active.id === over.id) return null;

  if (active.parent_id === over.parent_id) {
    return {
      action: "reorder",
      activeId,
      overId,
      nextParentId: active.parent_id,
      targetParentId: active.parent_id,
    };
  }

  if (active.parent_id === null && over.parent_id !== null) {
    return {
      action: "reorder",
      activeId,
      overId: over.parent_id,
      nextParentId: null,
      targetParentId: null,
    };
  }

  return {
    action: "blocked",
    activeId,
    overId,
    nextParentId: active.parent_id,
    targetParentId: null,
    message: "Move right to nest or left to move to the top level.",
  };
}

export function moveFolder(
  folders: Folder[],
  activeId: string,
  overId: string,
  nextParentId: string | null,
): Folder[] {
  const active = folders.find((folder) => folder.id === activeId);
  const over = folders.find((folder) => folder.id === overId);
  if (!active || !over) return sortFolders(folders);

  const groups = new Map<string, Folder[]>();
  for (const folder of sortFolders(folders)) {
    const key = groupKey(folder.parent_id);
    const siblings = groups.get(key) ?? [];
    siblings.push(folder);
    groups.set(key, siblings);
  }

  const previousParentId = active.parent_id;
  const previousGroup = groups.get(groupKey(previousParentId)) ?? [];
  const oldIndex = previousGroup.findIndex((folder) => folder.id === activeId);
  groups.set(
    groupKey(previousParentId),
    previousGroup.filter((folder) => folder.id !== activeId),
  );

  const targetKey = groupKey(nextParentId);
  const targetGroup = groups.get(targetKey) ?? [];
  const overIndex = targetGroup.findIndex((folder) => folder.id === overId);
  const originalOverIndex = previousGroup.findIndex(
    (folder) => folder.id === overId,
  );

  if (previousParentId === nextParentId && originalOverIndex !== -1) {
    groups.set(targetKey, arrayMove(previousGroup, oldIndex, originalOverIndex));
  } else {
    const insertionIndex = overIndex === -1 ? targetGroup.length : overIndex;
    targetGroup.splice(insertionIndex, 0, { ...active, parent_id: nextParentId });
    groups.set(targetKey, targetGroup);
  }

  const placementById = new Map<string, FolderPlacement>();
  for (const siblings of groups.values()) {
    siblings.forEach((folder, sortOrder) => {
      placementById.set(folder.id, {
        id: folder.id,
        parentId:
          folder.id === activeId ? nextParentId : folder.parent_id,
        sortOrder,
      });
    });
  }

  return applyFolderPlacements(folders, [...placementById.values()]);
}
