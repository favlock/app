import type { EntryKind } from "../types/bookmark";
import {
  patchAuthenticatedJsonWithoutResponse,
  postAuthenticatedJson,
  postAuthenticatedJsonWithoutResponse,
  putAuthenticatedJsonWithoutResponse,
} from "./authenticatedApi";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EntryWriteValues = {
  title: string;
  content: string;
  folderId: string | null;
  existingTagIds: string[];
  newEncryptedTagNames: string[];
  dueDate?: string | null;
};

export async function createEntry(
  accessToken: string,
  kind: EntryKind,
  values: EntryWriteValues,
): Promise<string> {
  const payload = await postAuthenticatedJson(
    "/v1/entries",
    accessToken,
    entryBody(kind, values),
    "Could not create the encrypted entry.",
  );
  return createdEntryId(payload, "Could not create the encrypted entry.");
}

export async function updateEntry(
  accessToken: string,
  entryId: string,
  values: EntryWriteValues,
): Promise<void> {
  await putAuthenticatedJsonWithoutResponse(
    entryPath(entryId),
    accessToken,
    entryBody("note", values),
    "Could not update the encrypted document.",
  );
}

export async function updateTodo(
  accessToken: string,
  todoId: string,
  values: EntryWriteValues,
): Promise<void> {
  await putAuthenticatedJsonWithoutResponse(
    entryPath(todoId),
    accessToken,
    entryBody("todo", values),
    "Could not update the encrypted Todo.",
  );
}

export async function deleteEntry(
  accessToken: string,
  kind: EntryKind,
  entryId: string,
): Promise<void> {
  await postAuthenticatedJsonWithoutResponse(
    `${entryPath(entryId)}/trash`,
    accessToken,
    { kind },
    "Could not move the encrypted entry to Trash.",
  );
}

export async function setTodoCompleted(
  accessToken: string,
  todoId: string,
  isCompleted: boolean,
): Promise<void> {
  await patchAuthenticatedJsonWithoutResponse(
    `${entryPath(todoId)}/completion`,
    accessToken,
    { isCompleted },
    "Could not update the Todo status.",
  );
}

export async function updateEntryFolder(
  accessToken: string,
  values: {
    entryId: string;
    kind: EntryKind;
    folderId: string | null;
  },
): Promise<void> {
  await patchAuthenticatedJsonWithoutResponse(
    `${entryPath(values.entryId)}/folder`,
    accessToken,
    { kind: values.kind, folderId: values.folderId },
    "Could not move the encrypted entry.",
  );
}

export async function createReadspaceEntry(
  accessToken: string,
  values: {
    title: string;
    content: string;
    folderId: string | null;
    existingTagIds: string[];
    newEncryptedTagNames: string[];
  },
): Promise<string> {
  const payload = await postAuthenticatedJson(
    "/v1/entries",
    accessToken,
    entryBody("read", values),
    "Could not save the encrypted Readspace article.",
  );
  return createdEntryId(
    payload,
    "Could not save the encrypted Readspace article.",
  );
}

export async function updateReadspaceOrganization(
  accessToken: string,
  values: {
    entryId: string;
    folderId: string | null;
    existingTagIds: string[];
    newEncryptedTagNames: string[];
  },
): Promise<void> {
  await putAuthenticatedJsonWithoutResponse(
    `${entryPath(values.entryId)}/readspace-organization`,
    accessToken,
    {
      folderId: values.folderId,
      existingTagIds: values.existingTagIds,
      newEncryptedTagNames: values.newEncryptedTagNames,
    },
    "Could not organize the encrypted Readspace article.",
  );
}

function entryBody(kind: EntryKind, values: EntryWriteValues) {
  const body = {
    kind,
    encryptedTitle: values.title,
    encryptedContent: values.content,
    dueDate: kind === "todo" ? (values.dueDate ?? null) : null,
    folderId: values.folderId,
    existingTagIds: values.existingTagIds,
    newEncryptedTagNames: values.newEncryptedTagNames,
  };
  // The existing API accepts a maximum 64 KiB request. Include the entire
  // encrypted request, not just visible text or HTML, in this client UX check.
  if (
    kind !== "read" &&
    new TextEncoder().encode(JSON.stringify(body)).byteLength > 64 * 1024
  ) {
    throw new Error(
      "This entry is too large to save. Shorten the text or simplify its formatting, then try again. Your changes have not been saved.",
    );
  }
  return body;
}

export function validateEntryWriteSize(
  kind: EntryKind,
  values: EntryWriteValues,
): void {
  entryBody(kind, values);
}

function entryPath(entryId: string): `/v1/entries/${string}` {
  return `/v1/entries/${encodeURIComponent(entryId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createdEntryId(payload: unknown, failureMessage: string): string {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error(failureMessage);
  }
  const entryId = payload.data.entryId;
  if (typeof entryId !== "string" || !UUID_PATTERN.test(entryId)) {
    throw new Error(failureMessage);
  }
  return entryId;
}
