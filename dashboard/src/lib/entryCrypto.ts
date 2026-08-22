import { decryptField, ENC_PREFIX } from "./encryption";
import { sanitizeEntryHtml } from "./entryContent";
import type { Entry, Folder, Tag } from "../types/bookmark";

export type EntryRelationLink = {
  tags: Tag | Tag[] | null;
};

export type EncryptedEntryRow<TEntry extends Entry> = Omit<
  TEntry,
  "folder" | "tags"
> & {
  folder?: Folder | Folder[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function decryptEntryRows<
  TEntry extends Entry,
  TRow extends EncryptedEntryRow<TEntry>,
>(
  rows: TRow[],
  getTagLinks: (row: TRow) => EntryRelationLink[] | null | undefined,
  key: CryptoKey | null,
): Promise<TEntry[]> {
  const mapped = rows.map((row) => ({
    ...row,
    folder: firstRelation(row.folder),
    tags:
      getTagLinks(row)
        ?.map((link) => firstRelation(link.tags))
        .filter((tag): tag is Tag => Boolean(tag)) ?? [],
  })) as unknown as TEntry[];

  if (!key) return mapped;

  return Promise.all(
    mapped.map(async (entry) => ({
      ...entry,
      title: await decryptField(entry.title, key),
      content:
        entry.kind === "read"
          ? await decryptField(entry.content, key)
          : sanitizeEntryHtml(await decryptField(entry.content, key)),
      folder: entry.folder
        ? { ...entry.folder, name: await decryptField(entry.folder.name, key) }
        : null,
      tags: await Promise.all(
        (entry.tags ?? []).map(async (tag) => ({
          ...tag,
          name: await decryptField(tag.name, key),
        })),
      ),
    })),
  );
}

export function hasEncryptedEntryFields(entries: Entry[]): boolean {
  return entries.some(
    (entry) =>
      entry.title.startsWith(ENC_PREFIX) ||
      entry.content.startsWith(ENC_PREFIX) ||
      entry.folder?.name.startsWith(ENC_PREFIX) ||
      entry.tags?.some((tag) => tag.name.startsWith(ENC_PREFIX)),
  );
}
