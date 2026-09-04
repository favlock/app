import {
  deleteAuthenticatedWithoutResponse,
  fetchAuthenticatedJson,
  postAuthenticatedJson,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";
import type { EncryptedWebHighlightPayload } from "./webHighlight";

export type EncryptedHighlightRecord = {
  id: string;
  bookmarkId: string | null;
  entryId: string | null;
  payload: EncryptedWebHighlightPayload;
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStructuredPayload(value: unknown): EncryptedWebHighlightPayload | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const encrypted = (field: unknown) => typeof field === "string" && field.startsWith("enc:");
  const colors = ["yellow", "green", "blue", "pink"] as const;
  if (
    !encrypted(value.encryptedQuote) ||
    !encrypted(value.encryptedAnchors) ||
    !(value.encryptedAnnotation === null || encrypted(value.encryptedAnnotation)) ||
    !colors.includes(value.color as (typeof colors)[number])
  ) return null;
  return value as EncryptedWebHighlightPayload;
}

function parsePage(value: unknown): {
  items: EncryptedHighlightRecord[];
  nextOffset: number | null;
} {
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.items)) {
    throw new Error("Could not load encrypted highlights.");
  }
  const items = value.data.items.flatMap((item): EncryptedHighlightRecord[] => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !(
        (typeof item.bookmarkId === "string" && item.entryId === null) ||
        (item.bookmarkId === null && typeof item.entryId === "string")
      ) ||
      typeof item.createdAt !== "string" ||
      typeof item.updatedAt !== "string"
    ) return [];
    const payload = parseStructuredPayload(item.payload);
    if (!payload) return [];
    return [{
      id: item.id,
      bookmarkId: item.bookmarkId,
      entryId: item.entryId,
      payload,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }];
  });
  if (items.length !== value.data.items.length) {
    throw new Error("Could not load encrypted highlights.");
  }
  const nextOffset = value.data.nextOffset;
  if (nextOffset !== null && (!Number.isSafeInteger(nextOffset) || Number(nextOffset) < 0)) {
    throw new Error("Could not load encrypted highlights.");
  }
  return { items, nextOffset: nextOffset === null ? null : Number(nextOffset) };
}

export async function loadEncryptedHighlights(accessToken: string) {
  const highlights: EncryptedHighlightRecord[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const payload = await fetchAuthenticatedJson(
      `/v1/highlights?source=all&limit=200&offset=${offset}`,
      accessToken,
      "Could not load encrypted highlights.",
    );
    const page = parsePage(payload);
    highlights.push(...page.items);
    offset = page.nextOffset;
  }
  return highlights;
}

export async function createArticleHighlight(
  accessToken: string,
  entryId: string,
  payload: EncryptedWebHighlightPayload,
): Promise<string> {
  const response = await postAuthenticatedJson(
    "/v1/highlights",
    accessToken,
    { entryId, payload },
    "Could not save the encrypted highlight.",
  );
  if (
    !isRecord(response) ||
    !isRecord(response.data) ||
    typeof response.data.highlightId !== "string"
  ) throw new Error("Could not save the encrypted highlight.");
  return response.data.highlightId;
}

export function deleteHighlight(accessToken: string, highlightId: string) {
  return deleteAuthenticatedWithoutResponse(
    `/v1/highlights/${encodeURIComponent(highlightId)}`,
    accessToken,
    "Could not delete the encrypted highlight.",
  );
}

export function updateHighlightAnnotation(
  accessToken: string,
  highlightId: string,
  update: { encryptedAnnotation: string | null },
) {
  return putAuthenticatedJsonWithoutResponse(
    `/v1/highlights/${encodeURIComponent(highlightId)}/annotation`,
    accessToken,
    update,
    "Could not save the encrypted annotation.",
  );
}

export function updateHighlightColor(
  accessToken: string,
  highlightId: string,
  update: { color: EncryptedWebHighlightPayload["color"] },
) {
  return putAuthenticatedJsonWithoutResponse(
    `/v1/highlights/${encodeURIComponent(highlightId)}/color`,
    accessToken,
    update,
    "Could not update the highlight color.",
  );
}
