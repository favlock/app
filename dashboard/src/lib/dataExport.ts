import type {
  Bookmark,
  Folder,
  Note,
  ReadspaceEntry,
  Tag,
  Todo,
} from "../types/bookmark";

export type ExportCategory = "bookmarks" | "notes" | "todos" | "readspace";

export type ExportSelection = Record<ExportCategory, boolean>;

export type ExportSourceData = {
  bookmarks: Bookmark[];
  folders: Folder[];
  tags: Tag[];
  notes: Note[];
  todos: Todo[];
  readspace: ReadspaceEntry[];
};

type ExportedEntry = {
  id: string;
  title: string;
  content: string;
  collectionId: string | null;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
};

const mapEntry = (
  entry: Note | Todo | ReadspaceEntry,
): ExportedEntry => ({
  id: entry.id,
  title: entry.title,
  content: entry.content,
  collectionId: entry.folder?.id ?? null,
  tagIds: (entry.tags ?? []).map((tag) => tag.id),
  createdAt: entry.created_at,
  updatedAt: entry.updated_at,
});

export function buildFavLockExport(
  source: ExportSourceData,
  selection: ExportSelection,
  exportedAt = new Date(),
) {
  return {
    format: "favlock-export" as const,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    encrypted: false,
    selection,
    data: {
      collections: source.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        color: folder.color,
        parentId: folder.parent_id,
        sortOrder: folder.sort_order,
        createdAt: folder.created_at,
      })),
      tags: source.tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        createdAt: tag.created_at,
      })),
      ...(selection.bookmarks
        ? {
            bookmarks: source.bookmarks.map((bookmark) => ({
              id: bookmark.id,
              title: bookmark.title,
              url: bookmark.url,
              collectionIds: (bookmark.folders ?? []).map(
                (folder) => folder.id,
              ),
              tagIds: (bookmark.tags ?? []).map((tag) => tag.id),
              isFavorite: bookmark.is_favorite ?? false,
              favoritedAt: bookmark.favorited_at ?? null,
              createdAt: bookmark.created_at,
            })),
          }
        : {}),
      ...(selection.notes
        ? { notes: source.notes.map(mapEntry) }
        : {}),
      ...(selection.todos
        ? {
            todos: source.todos.map((todo) => ({
              ...mapEntry(todo),
              isCompleted: todo.is_completed,
              completedAt: todo.completed_at,
            })),
          }
        : {}),
      ...(selection.readspace
        ? { readspace: source.readspace.map(mapEntry) }
        : {}),
    },
  };
}
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unixSeconds(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? "" : Math.floor(timestamp / 1000).toString();
}

function bookmarkLine(bookmark: Bookmark, indent: string): string {
  const tags = (bookmark.tags ?? []).map((tag) => tag.name).join(",");
  const attributes = [
    `HREF="${escapeHtml(bookmark.url)}"`,
    `ADD_DATE="${unixSeconds(bookmark.created_at)}"`,
    ...(tags ? [`TAGS="${escapeHtml(tags)}"`] : []),
  ].join(" ");

  return `${indent}<DT><A ${attributes}>${escapeHtml(bookmark.title)}</A>`;
}

export function buildBrowserBookmarksHtml(
  bookmarks: Bookmark[],
  folders: Folder[],
): string {
  const knownFolderIds = new Set(folders.map((folder) => folder.id));
  const bookmarksByFolder = new Map<string, Bookmark[]>();
  const rootBookmarks: Bookmark[] = [];

  for (const bookmark of bookmarks) {
    const assignedFolderIds = (bookmark.folders ?? [])
      .map((folder) => folder.id)
      .filter((id) => knownFolderIds.has(id));

    if (assignedFolderIds.length === 0) {
      rootBookmarks.push(bookmark);
      continue;
    }

    for (const folderId of assignedFolderIds) {
      const assigned = bookmarksByFolder.get(folderId) ?? [];
      assigned.push(bookmark);
      bookmarksByFolder.set(folderId, assigned);
    }
  }

  const childrenByParent = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const parentId =
      folder.parent_id && knownFolderIds.has(folder.parent_id)
        ? folder.parent_id
        : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(folder);
    childrenByParent.set(parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.name.localeCompare(right.name),
    );
  }

  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>FavLock Bookmarks</TITLE>",
    "<H1>FavLock Bookmarks</H1>",
    "<DL><p>",
  ];
  const visited = new Set<string>();

  const appendFolder = (folder: Folder, depth: number) => {
    if (visited.has(folder.id)) return;
    visited.add(folder.id);
    const indent = "    ".repeat(depth);
    lines.push(
      `${indent}<DT><H3 ADD_DATE="${unixSeconds(folder.created_at)}">${escapeHtml(folder.name)}</H3>`,
      `${indent}<DL><p>`,
    );
    for (const bookmark of bookmarksByFolder.get(folder.id) ?? []) {
      lines.push(bookmarkLine(bookmark, `${indent}    `));
    }
    for (const child of childrenByParent.get(folder.id) ?? []) {
      appendFolder(child, depth + 1);
    }
    lines.push(`${indent}</DL><p>`);
  };

  for (const bookmark of rootBookmarks) {
    lines.push(bookmarkLine(bookmark, "    "));
  }
  for (const folder of childrenByParent.get(null) ?? []) {
    appendFolder(folder, 1);
  }
  // Include any folders involved in an invalid parent cycle instead of dropping them.
  for (const folder of folders) {
    appendFolder(folder, 1);
  }
  lines.push("</DL><p>");

  return `${lines.join("\n")}\n`;
}
