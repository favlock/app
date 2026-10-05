import type {
  BrowserBookmarkImportItem,
  BrowserBookmarkImportResult,
} from "./browserBookmarkImport";

export type ReadLaterImportSource = "pocket" | "raindrop";

export const POCKET_COLLECTION = "Pocket";
export const POCKET_ARCHIVE_COLLECTION = "Archive";
const RAINDROP_UNSORTED_COLLECTION = "unsorted";
const MAX_CSV_IMPORT_ROWS = 100_000;

export function parseCsv(text: string, maxRows = MAX_CSV_IMPORT_ROWS + 1): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endRow = () => {
    row.push(field);
    field = "";
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    if (rows.length > maxRows) {
      throw new Error("The CSV export contains too many records to import safely.");
    }
  };

  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      endRow();
    } else {
      field += char;
    }
    index += 1;
  }

  if (quoted) throw new Error("The CSV export ends inside a quoted value.");
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

function headerIndex(header: string[]): Map<string, number> {
  return new Map(
    header.map((name, index) => [name.trim().toLowerCase(), index] as const),
  );
}

export function detectReadLaterCsv(header: string[]): ReadLaterImportSource | null {
  const columns = headerIndex(header);
  if (!columns.has("url")) return null;
  if (columns.has("folder") && (columns.has("excerpt") || columns.has("note"))) {
    return "raindrop";
  }
  if (columns.has("time_added") || columns.has("status")) return "pocket";
  return null;
}

export function splitImportedTags(value: string, separator: string): string[] {
  return value.split(separator).map((tag) => tag.trim()).filter(Boolean);
}

function mapRows(
  rows: string[][],
  toFolderPath: (cell: (name: string) => string) => string[],
  tagSeparator: string,
): BrowserBookmarkImportResult {
  const [header, ...records] = rows;
  if (records.length > MAX_CSV_IMPORT_ROWS) {
    throw new Error("The CSV export contains too many records to import safely.");
  }
  const columns = headerIndex(header ?? []);
  const bookmarks: BrowserBookmarkImportItem[] = [];
  const folderMap = new Map<string, string[]>();

  for (const record of records) {
    const cell = (name: string) => {
      const index = columns.get(name);
      return index === undefined ? "" : (record[index] ?? "").trim();
    };
    const url = cell("url");
    if (!url) continue;
    const folderPath = toFolderPath(cell);
    if (folderPath.length > 0) folderMap.set(JSON.stringify(folderPath), folderPath);
    const tags = splitImportedTags(cell("tags"), tagSeparator);
    bookmarks.push({
      title: cell("title"),
      url,
      folderPath,
      ...(tags.length > 0 ? { tags } : {}),
    });
  }

  return { bookmarks, folderPaths: Array.from(folderMap.values()) };
}

export function pocketFolderPath(status: string): string[] {
  return status.trim().toLowerCase() === "archive"
    ? [POCKET_COLLECTION, POCKET_ARCHIVE_COLLECTION]
    : [POCKET_COLLECTION];
}

export function parsePocketCsv(rows: string[][]): BrowserBookmarkImportResult {
  return mapRows(rows, (cell) => pocketFolderPath(cell("status")), "|");
}

export function parseRaindropCsv(rows: string[][]): BrowserBookmarkImportResult {
  return mapRows(rows, (cell) => {
    const path = cell("folder")
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    return path.length === 1 && path[0].toLowerCase() === RAINDROP_UNSORTED_COLLECTION
      ? []
      : path;
  }, ",");
}

export function parseReadLaterCsv(
  csvFiles: string[],
): { source: ReadLaterImportSource; result: BrowserBookmarkImportResult } | null {
  let source: ReadLaterImportSource | null = null;
  const bookmarks: BrowserBookmarkImportItem[] = [];
  const folderMap = new Map<string, string[]>();

  for (const text of csvFiles) {
    const rows = parseCsv(text);
    const fileSource = rows[0] ? detectReadLaterCsv(rows[0]) : null;
    if (!fileSource || (source && fileSource !== source)) continue;
    source = fileSource;
    const result = source === "pocket" ? parsePocketCsv(rows) : parseRaindropCsv(rows);
    bookmarks.push(...result.bookmarks);
    for (const path of result.folderPaths) folderMap.set(JSON.stringify(path), path);
    if (bookmarks.length > MAX_CSV_IMPORT_ROWS) {
      throw new Error("The CSV export contains too many records to import safely.");
    }
  }

  if (!source) return null;
  return {
    source,
    result: { bookmarks, folderPaths: Array.from(folderMap.values()) },
  };
}
