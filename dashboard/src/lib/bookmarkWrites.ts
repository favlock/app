import type { Tag } from "../types/bookmark";

export interface PreparedBookmarkTags {
  existingTagIds: string[];
  newEncryptedTagNames: string[];
}

export async function prepareBookmarkTags(
  tagNames: string[],
  existingTags: Tag[],
  encryptField: (text: string) => Promise<string>,
): Promise<PreparedBookmarkTags> {
  const normalizedNames = [
    ...new Set(
      tagNames
        .map((name) => name.replace(/#/g, "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const existingByName = new Map(
    existingTags.map((tag) => [tag.name.trim().toLowerCase(), tag.id]),
  );
  const existingTagIds: string[] = [];
  const newNames: string[] = [];

  for (const name of normalizedNames) {
    const existingTagId = existingByName.get(name);
    if (existingTagId) {
      existingTagIds.push(existingTagId);
    } else {
      newNames.push(name);
    }
  }

  return {
    existingTagIds,
    newEncryptedTagNames: await Promise.all(
      newNames.map((name) => encryptField(name)),
    ),
  };
}
