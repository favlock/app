import type { ColorConstant } from "../constants/colors";
import type { FolderPlacement } from "./folderOrder";
import {
  deleteAuthenticatedWithoutResponse,
  patchAuthenticatedJsonWithoutResponse,
  postAuthenticatedJson,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateFolderValues {
  encryptedName: string;
  color: ColorConstant | null;
  parentId: string | null;
  sortOrder: number;
}

export interface CreatedFolder {
  folderId: string;
  createdAt: string;
}

export async function createFolder(
  accessToken: string,
  values: CreateFolderValues,
): Promise<CreatedFolder> {
  const payload = await postAuthenticatedJson(
    "/v1/folders",
    accessToken,
    values,
    "Could not create the encrypted collection.",
  );
  return parseCreatedFolder(payload);
}

export function updateFolder(
  accessToken: string,
  folderId: string,
  updates: { encryptedName?: string; color?: ColorConstant | null },
): Promise<void> {
  return patchAuthenticatedJsonWithoutResponse(
    `/v1/folders/${encodeURIComponent(folderId)}`,
    accessToken,
    updates,
    "Could not update the encrypted collection.",
  );
}

export function arrangeFolders(
  accessToken: string,
  placements: FolderPlacement[],
): Promise<void> {
  return putAuthenticatedJsonWithoutResponse(
    "/v1/folders/order",
    accessToken,
    {
      placements: placements.map(({ id, parentId, sortOrder }) => ({
        folderId: id,
        parentId,
        sortOrder,
      })),
    },
    "Could not save the collection order.",
  );
}

export function deleteFolder(
  accessToken: string,
  folderId: string,
): Promise<void> {
  return deleteAuthenticatedWithoutResponse(
    `/v1/folders/${encodeURIComponent(folderId)}`,
    accessToken,
    "Could not delete the encrypted collection.",
  );
}

export function updateTag(
  accessToken: string,
  tagId: string,
  encryptedName: string,
): Promise<void> {
  return patchAuthenticatedJsonWithoutResponse(
    `/v1/tags/${encodeURIComponent(tagId)}`,
    accessToken,
    { encryptedName },
    "Could not update the encrypted tag.",
  );
}

export function deleteTag(accessToken: string, tagId: string): Promise<void> {
  return deleteAuthenticatedWithoutResponse(
    `/v1/tags/${encodeURIComponent(tagId)}`,
    accessToken,
    "Could not delete the encrypted tag.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseCreatedFolder(payload: unknown): CreatedFolder {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error("Could not create the encrypted collection.");
  }
  const { folderId, createdAt } = payload.data;
  if (
    typeof folderId !== "string" ||
    !UUID_PATTERN.test(folderId) ||
    typeof createdAt !== "string" ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    throw new Error("Could not create the encrypted collection.");
  }
  return { folderId, createdAt };
}
