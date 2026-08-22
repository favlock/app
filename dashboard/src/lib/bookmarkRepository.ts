import {
  patchAuthenticatedJsonWithoutResponse,
  postAuthenticatedJson,
  postAuthenticatedJsonWithoutResponse,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BookmarkWriteValues = {
  title: string;
  url: string;
  folderId: string | null;
  existingTagIds: string[];
  newEncryptedTagNames: string[];
};

export type BookmarkOrganizationValues = Omit<BookmarkWriteValues, "url">;

export type DuplicateBookmarkCleanupGroup = {
  survivorId: string;
  duplicateIds: string[];
};

export async function createBookmark(
  accessToken: string,
  values: BookmarkWriteValues,
): Promise<string> {
  const payload = await postAuthenticatedJson(
    "/v1/bookmarks",
    accessToken,
    {
      encryptedTitle: values.title,
      encryptedUrl: values.url,
      folderId: values.folderId,
      existingTagIds: values.existingTagIds,
      newEncryptedTagNames: values.newEncryptedTagNames,
    },
    "Could not create the encrypted bookmark.",
  );
  return createdBookmarkId(payload, "Could not create the encrypted bookmark.");
}

export async function updateBookmark(
  accessToken: string,
  bookmarkId: string,
  values: BookmarkOrganizationValues,
): Promise<void> {
  await putAuthenticatedJsonWithoutResponse(
    bookmarkPath(bookmarkId),
    accessToken,
    {
      encryptedTitle: values.title,
      folderId: values.folderId,
      existingTagIds: values.existingTagIds,
      newEncryptedTagNames: values.newEncryptedTagNames,
    },
    "Could not update the encrypted bookmark.",
  );
}

export async function trashBookmark(
  accessToken: string,
  bookmarkId: string,
): Promise<void> {
  await postAuthenticatedJsonWithoutResponse(
    `${bookmarkPath(bookmarkId)}/trash`,
    accessToken,
    {},
    "Could not move the encrypted bookmark to Trash.",
  );
}

export async function setBookmarkFavorite(
  accessToken: string,
  bookmarkId: string,
  isFavorite: boolean,
): Promise<void> {
  await patchAuthenticatedJsonWithoutResponse(
    `${bookmarkPath(bookmarkId)}/favorite`,
    accessToken,
    { isFavorite },
    "Could not update the bookmark favorite status.",
  );
}

export async function moveBookmarkToFolder(
  accessToken: string,
  bookmarkId: string,
  folderId: string | null,
): Promise<void> {
  await patchAuthenticatedJsonWithoutResponse(
    `${bookmarkPath(bookmarkId)}/folder`,
    accessToken,
    { folderId },
    "Could not move the encrypted bookmark.",
  );
}

export async function overwriteBookmarkImportContent(
  accessToken: string,
  bookmarkId: string,
  encryptedTitle: string,
  encryptedUrl: string,
): Promise<void> {
  await patchAuthenticatedJsonWithoutResponse(
    `${bookmarkPath(bookmarkId)}/import-content`,
    accessToken,
    { encryptedTitle, encryptedUrl },
    "Could not overwrite the encrypted bookmark.",
  );
}

export async function cleanupDuplicateBookmarks(
  accessToken: string,
  groups: DuplicateBookmarkCleanupGroup[],
): Promise<number> {
  const payload = await postAuthenticatedJson(
    "/v1/bookmarks/duplicates/cleanup",
    accessToken,
    { groups },
    "Could not clean up duplicate bookmarks.",
  );
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !Number.isSafeInteger(payload.data.removedCount) ||
    (payload.data.removedCount as number) < 0
  ) {
    throw new Error("Could not clean up duplicate bookmarks.");
  }
  return payload.data.removedCount as number;
}

function bookmarkPath(bookmarkId: string): `/v1/bookmarks/${string}` {
  return `/v1/bookmarks/${encodeURIComponent(bookmarkId)}`;
}

function createdBookmarkId(payload: unknown, failureMessage: string): string {
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    typeof payload.data.bookmarkId !== "string" ||
    !UUID_PATTERN.test(payload.data.bookmarkId)
  ) {
    throw new Error(failureMessage);
  }
  return payload.data.bookmarkId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
