import {
  deleteAuthenticatedWithoutResponse,
  fetchAuthenticatedJson,
  postAuthenticatedJson,
  postAuthenticatedJsonWithoutBody,
} from "./authenticatedApi";

export type TrashResourceType = "bookmark" | "note" | "todo" | "read";

export type TrashItem = {
  id: string;
  resourceId: string;
  resourceType: TrashResourceType;
  encryptedTitle: string;
  encryptedUrl: string | null;
  deletedAt: string;
  expiresAt: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRASH_PAGE_SIZE = 200;
const TRASH_PREVIEW_MAX_LENGTH = 131_072;
const TRASH_RESOURCE_TYPES = new Set<TrashResourceType>([
  "bookmark",
  "note",
  "todo",
  "read",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseTrashItem(value: unknown): TrashItem {
  if (!isRecord(value)) throw new Error("Could not load Trash.");
  const resourceType = value.resourceType;
  const encryptedUrl = value.encryptedUrl;
  if (
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.resourceId !== "string" ||
    !UUID_PATTERN.test(value.resourceId) ||
    typeof resourceType !== "string" ||
    !TRASH_RESOURCE_TYPES.has(resourceType as TrashResourceType) ||
    typeof value.encryptedTitle !== "string" ||
    value.encryptedTitle.length > TRASH_PREVIEW_MAX_LENGTH ||
    (encryptedUrl !== null &&
      (typeof encryptedUrl !== "string" ||
        encryptedUrl.length > TRASH_PREVIEW_MAX_LENGTH)) ||
    typeof value.deletedAt !== "string" ||
    Number.isNaN(Date.parse(value.deletedAt)) ||
    typeof value.expiresAt !== "string" ||
    Number.isNaN(Date.parse(value.expiresAt))
  ) {
    throw new Error("Could not load Trash.");
  }
  return {
    id: value.id,
    resourceId: value.resourceId,
    resourceType: resourceType as TrashResourceType,
    encryptedTitle: value.encryptedTitle,
    encryptedUrl,
    deletedAt: value.deletedAt,
    expiresAt: value.expiresAt,
  };
}

function parseTrashPage(value: unknown): {
  items: TrashItem[];
  nextCursor: string | null;
} {
  if (!isRecord(value) || !isRecord(value.data)) {
    throw new Error("Could not load Trash.");
  }
  const { items, nextCursor } = value.data;
  if (
    !Array.isArray(items) ||
    items.length > TRASH_PAGE_SIZE ||
    (nextCursor !== null &&
      (typeof nextCursor !== "string" || !UUID_PATTERN.test(nextCursor)))
  ) {
    throw new Error("Could not load Trash.");
  }
  return { items: items.map(parseTrashItem), nextCursor };
}

export async function fetchTrashItems(
  accessToken: string,
  ids?: string[],
): Promise<TrashItem[]> {
  if (ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.some((id) => !UUID_PATTERN.test(id))) {
      throw new Error("Could not load Trash.");
    }
    const items: TrashItem[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += TRASH_PAGE_SIZE) {
      const page = parseTrashPage(
        await postAuthenticatedJson(
          "/v1/trash/resolve",
          accessToken,
          { ids: uniqueIds.slice(offset, offset + TRASH_PAGE_SIZE) },
          "Could not load Trash.",
        ),
      );
      if (page.nextCursor !== null) throw new Error("Could not load Trash.");
      items.push(...page.items);
    }
    return items;
  }

  const items: TrashItem[] = [];
  let cursor: string | null = null;
  for (;;) {
    const path = cursor
      ? (`/v1/trash?limit=${TRASH_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}` as const)
      : (`/v1/trash?limit=${TRASH_PAGE_SIZE}` as const);
    const page = parseTrashPage(
      await fetchAuthenticatedJson(path, accessToken, "Could not load Trash."),
    );
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    if (page.nextCursor === cursor) throw new Error("Could not load Trash.");
    cursor = page.nextCursor;
  }
}

function requireResourceId(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new Error("Could not restore this item.");
  }
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== "object") {
    throw new Error("Could not restore this item.");
  }
  const resourceId = (data as Record<string, unknown>).resourceId;
  if (typeof resourceId !== "string" || !UUID_PATTERN.test(resourceId)) {
    throw new Error("Could not restore this item.");
  }
  return resourceId;
}

export async function restoreTrashItem(
  accessToken: string,
  trashId: string,
): Promise<string> {
  if (!UUID_PATTERN.test(trashId)) throw new Error("Could not restore this item.");
  return requireResourceId(
    await postAuthenticatedJsonWithoutBody(
      `/v1/trash/${trashId}/restore`,
      accessToken,
      "Could not restore this item.",
    ),
  );
}

export async function permanentlyDeleteTrashItem(
  accessToken: string,
  trashId: string,
): Promise<void> {
  if (!UUID_PATTERN.test(trashId)) {
    throw new Error("Could not permanently delete this item.");
  }
  await deleteAuthenticatedWithoutResponse(
    `/v1/trash/${trashId}`,
    accessToken,
    "Could not permanently delete this item.",
  );
}

export async function emptyTrash(accessToken: string): Promise<void> {
  await deleteAuthenticatedWithoutResponse(
    "/v1/trash",
    accessToken,
    "Could not empty Trash.",
  );
}
