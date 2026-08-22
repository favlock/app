import { strFromU8, unzip, type Unzipped } from "fflate";

export interface BrowserBookmarkImportItem {
  title: string;
  url: string;
  folderPath: string[];
}

export interface BrowserBookmarkImportResult {
  bookmarks: BrowserBookmarkImportItem[];
  folderPaths: string[][];
}

export interface ExistingImportFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

const MAX_CHROME_IMPORT_NODES = 100_000;
const MAX_ZIP_FILE_SIZE = 250 * 1024 * 1024;
const MAX_BOOKMARK_HTML_SIZE = 25 * 1024 * 1024;

interface BrowserBookmarkImportFile {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

function getElementText(node: Element | null | undefined): string {
  return node?.textContent?.trim() ?? "";
}

function findFolderHeadingForDl(dl: Element): Element | null {
  let sibling: Element | null = dl.previousElementSibling;

  while (sibling) {
    if (sibling.matches("H3, H2")) return sibling;

    const nestedHeading = sibling.querySelector("H3, H2");
    if (nestedHeading) return nestedHeading;

    sibling = sibling.previousElementSibling;
  }

  // Some exports wrap the matching heading in a nearby DT/parent container.
  const parentHeading = dl.parentElement?.querySelector(":scope > DT > H3, :scope > DT > H2");
  return parentHeading ?? null;
}

function getAnchorFolderPath(anchor: Element): string[] {
  const path: string[] = [];
  let currentDl = anchor.closest("DL");

  while (currentDl) {
    const heading = findFolderHeadingForDl(currentDl);
    const headingText = getElementText(heading);

    if (headingText) {
      path.unshift(headingText);
    }

    currentDl = currentDl.parentElement?.closest("DL") ?? null;
  }

  return path;
}

export function parseBrowserBookmarksHtml(
  html: string,
): BrowserBookmarkImportResult {
  const document = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(document.querySelectorAll("A[href]"));

  if (anchors.length === 0) {
    return { bookmarks: [], folderPaths: [] };
  }

  const bookmarks: BrowserBookmarkImportItem[] = [];
  const folderMap = new Map<string, string[]>();

  for (const anchor of anchors) {
    const url = anchor.getAttribute("href")?.trim() ?? "";
    if (!url) continue;

    const folderPath = getAnchorFolderPath(anchor);
    const folderKey = folderPathKey(folderPath);
    if (!folderMap.has(folderKey)) {
      folderMap.set(folderKey, folderPath);
    }

    bookmarks.push({
      title: getElementText(anchor),
      url,
      folderPath,
    });
  }

  return {
    bookmarks,
    folderPaths: Array.from(folderMap.values()).filter((path) => path.length > 0),
  };
}

function isZipFile(file: BrowserBookmarkImportFile): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    ["application/zip", "application/x-zip-compressed"].includes(file.type)
  );
}

function unzipAsync(
  archive: Uint8Array,
  onHtmlFile: (name: string, originalSize: number) => boolean,
): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(
      archive,
      {
        filter: (entry) => onHtmlFile(entry.name, entry.originalSize),
      },
      (error, files) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(files);
      },
    );
  });
}

function bookmarkHtmlPriority(path: string): number {
  const fileName = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (fileName === "bookmarks.html" || fileName === "bookmarks.htm") return 0;
  if (fileName.includes("bookmark")) return 1;
  return 2;
}

async function parseBrowserBookmarksZip(
  file: BrowserBookmarkImportFile,
): Promise<BrowserBookmarkImportResult> {
  if (file.size > MAX_ZIP_FILE_SIZE) {
    throw new Error("The selected ZIP file is too large to import safely.");
  }

  let foundHtmlFile = false;
  let foundBookmarkHtmlFile = false;
  let foundOversizedHtmlFile = false;
  let files: Unzipped;

  try {
    files = await unzipAsync(
      new Uint8Array(await file.arrayBuffer()),
      (name, originalSize) => {
        if (!/\.html?$/i.test(name)) return false;
        foundHtmlFile = true;
        if (bookmarkHtmlPriority(name) < 2) {
          foundBookmarkHtmlFile = true;
        }

        if (originalSize > MAX_BOOKMARK_HTML_SIZE) {
          foundOversizedHtmlFile = true;
          return false;
        }

        return true;
      },
    );
  } catch {
    throw new Error(
      "Could not read the selected ZIP file. Choose Safari's exported ZIP file and try again.",
    );
  }

  const htmlFiles = Object.entries(files).sort(([left], [right]) => {
    const priorityDifference =
      bookmarkHtmlPriority(left) - bookmarkHtmlPriority(right);
    return priorityDifference || left.localeCompare(right);
  });
  const candidateFiles = foundBookmarkHtmlFile
    ? htmlFiles.filter(([name]) => bookmarkHtmlPriority(name) < 2)
    : htmlFiles;

  for (const [, contents] of candidateFiles) {
    const result = parseBrowserBookmarksHtml(strFromU8(contents));
    if (result.bookmarks.length > 0) return result;
  }

  if (foundOversizedHtmlFile) {
    throw new Error(
      "The bookmark HTML inside the ZIP file is too large to import safely.",
    );
  }

  if (!foundHtmlFile) {
    throw new Error(
      "No HTML bookmark export was found inside the selected ZIP file.",
    );
  }

  throw new Error(
    "No bookmarks were found in the HTML export inside the ZIP file.",
  );
}

export async function parseBrowserBookmarksFile(
  file: BrowserBookmarkImportFile,
): Promise<BrowserBookmarkImportResult> {
  if (isZipFile(file)) return parseBrowserBookmarksZip(file);

  const result = parseBrowserBookmarksHtml(await file.text());
  if (result.bookmarks.length === 0) {
    throw new Error("No bookmarks were found in the selected HTML export.");
  }

  return result;
}

export function parseChromeBookmarksTree(
  value: unknown,
): BrowserBookmarkImportResult {
  if (!Array.isArray(value)) {
    return { bookmarks: [], folderPaths: [] };
  }

  const bookmarks: BrowserBookmarkImportItem[] = [];
  const folderMap = new Map<string, string[]>();
  const pending = value
    .map((node) => ({ node, parentPath: [] as string[] }))
    .reverse();
  let visitedNodes = 0;

  while (pending.length > 0) {
    visitedNodes += 1;
    if (visitedNodes > MAX_CHROME_IMPORT_NODES) {
      throw new Error(
        "Chrome returned too many bookmark entries to import safely.",
      );
    }

    const current = pending.pop();
    if (!current || typeof current.node !== "object" || current.node === null) {
      continue;
    }

    const node = current.node as Record<string, unknown>;
    const title = typeof node.title === "string" ? node.title.trim() : "";
    const url = typeof node.url === "string" ? node.url.trim() : "";

    if (url) {
      bookmarks.push({ title, url, folderPath: current.parentPath });
      continue;
    }

    const folderPath = title
      ? [...current.parentPath, title]
      : current.parentPath;
    if (title) {
      folderMap.set(folderPathKey(folderPath), folderPath);
    }

    if (!Array.isArray(node.children)) continue;

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push({ node: node.children[index], parentPath: folderPath });
    }
  }

  return { bookmarks, folderPaths: Array.from(folderMap.values()) };
}

export function normalizeImportedBookmarkUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getImportedBookmarkTitle(
  title: string,
  url: string,
): string {
  const trimmedTitle = title.replace(/\s+/g, " ").trim();

  const pathLikeSegments = trimmedTitle
    .split(/\s(?:›|»|>)\s/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const normalizedTitle =
    pathLikeSegments.length > 1
      ? pathLikeSegments[pathLikeSegments.length - 1]
      : trimmedTitle;

  if (normalizedTitle) return normalizedTitle;

  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.toString();
  } catch {
    return url;
  }
}

export function folderPathKey(folderPath: string[]): string {
  return JSON.stringify(folderPath.map((segment) => segment.trim()));
}

export function folderPathLabel(folderPath: string[]): string {
  return folderPath.map((segment) => segment.trim()).join(" › ");
}

export function toSupportedFolderPath(folderPath: string[]): string[] {
  const normalizedPath = folderPath
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (normalizedPath.length <= 2) return normalizedPath;

  return [normalizedPath[0], folderPathLabel(normalizedPath.slice(1))];
}

export function getImportFolderPaths(folderPaths: string[][]): string[][] {
  const pathMap = new Map<string, string[]>();

  for (const sourcePath of folderPaths) {
    const folderPath = toSupportedFolderPath(sourcePath);
    if (folderPath.length === 0) continue;

    const rootPath = folderPath.slice(0, 1);
    pathMap.set(folderPathKey(rootPath), rootPath);
    pathMap.set(folderPathKey(folderPath), folderPath);
  }

  return Array.from(pathMap.values()).sort(
    (left, right) => left.length - right.length,
  );
}

export function getExistingFolderIdByPath(
  folders: ExistingImportFolder[],
): Map<string, string> {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderIdByPath = new Map<string, string>();

  for (const folder of folders) {
    const parent = folder.parent_id
      ? folderById.get(folder.parent_id)
      : undefined;
    const folderPath = parent
      ? [parent.name, folder.name]
      : [folder.name];

    folderIdByPath.set(folderPathKey(folderPath), folder.id);
  }

  return folderIdByPath;
}
