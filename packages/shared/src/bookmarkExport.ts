export type BookmarkExportBrowserId =
  | "chrome"
  | "edge"
  | "firefox"
  | "safari";

export interface BookmarkExportGuide {
  id: BookmarkExportBrowserId;
  label: string;
  instructions: string;
}

export const BOOKMARK_EXPORT_GUIDES: readonly BookmarkExportGuide[] = [
  {
    id: "chrome",
    label: "Chrome",
    instructions:
      "Open More (⋮) → Bookmarks and lists → Bookmark Manager, then open More (⋮) and select Export bookmarks.",
  },
  {
    id: "edge",
    label: "Edge",
    instructions:
      "Open Favorites, select More options (⋯), then select Export favorites.",
  },
  {
    id: "firefox",
    label: "Firefox",
    instructions:
      "Open Menu (☰) → Bookmarks → Manage bookmarks, then select Import and Backup → Export Bookmarks to HTML.",
  },
  {
    id: "safari",
    label: "Safari",
    instructions:
      "On a Mac, select File → Export Browsing Data to File, select Bookmarks, then Download. On iPhone or iPad, open Settings → Apps → Safari → Export, select Bookmarks, then save the ZIP file.",
  },
] as const;

export function getBookmarkExportGuideForUserAgent(
  userAgent: string,
): BookmarkExportGuide | null {
  const browserId: BookmarkExportBrowserId | null = /Edg(?:A|iOS)?\//i.test(
    userAgent,
  )
    ? "edge"
    : /Firefox\/|FxiOS\//i.test(userAgent)
      ? "firefox"
      : /Chrome\/|CriOS\//i.test(userAgent)
        ? "chrome"
        : /Safari\//i.test(userAgent)
          ? "safari"
          : null;

  return (
    BOOKMARK_EXPORT_GUIDES.find((guide) => guide.id === browserId) ?? null
  );
}
