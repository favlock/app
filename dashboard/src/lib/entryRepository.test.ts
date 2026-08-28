import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./favLockAuth", () => import("../test/requestSessionAuthMock"));
import {
  createEntry,
  createReadspaceEntry,
  deleteEntry,
  setTodoCompleted,
  updateEntry,
  updateEntryFolder,
  updateReadspaceOrganization,
  updateTodo,
  type EntryWriteValues,
} from "./entryRepository";

const accessToken = "current.jwt.token";
const entryId = "11111111-1111-4111-8111-111111111111";
const secondEntryId = "22222222-2222-4222-8222-222222222222";
const folderId = "33333333-3333-4333-8333-333333333333";
const tagId = "44444444-4444-4444-8444-444444444444";

const values: EntryWriteValues = {
  title: "encrypted title",
  content: "encrypted content",
  folderId,
  existingTagIds: [tagId],
  newEncryptedTagNames: ["encrypted tag"],
  dueDate: "2026-08-08",
};

function createdResponse(id: string): Response {
  return new Response(JSON.stringify({ data: { entryId: id } }), {
    status: 201,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("entryRepository", () => {
  it("creates encrypted notes and Todos through the app API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createdResponse(entryId))
      .mockResolvedValueOnce(createdResponse(secondEntryId));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createEntry(accessToken, "note", values)).resolves.toBe(
      entryId,
    );
    await expect(createEntry(accessToken, "todo", values)).resolves.toBe(
      secondEntryId,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.favlock.example/v1/entries",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
        body: JSON.stringify({
          kind: "note",
          encryptedTitle: values.title,
          encryptedContent: values.content,
          dueDate: null,
          folderId,
          existingTagIds: [tagId],
          newEncryptedTagNames: ["encrypted tag"],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.favlock.example/v1/entries",
      expect.objectContaining({
        body: expect.stringContaining('"dueDate":"2026-08-08"'),
      }),
    );
  });

  it("updates note and Todo content through typed entry routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateEntry(accessToken, entryId, values);
    await updateTodo(accessToken, secondEntryId, values);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://api.favlock.example/v1/entries/${entryId}`,
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"kind":"note"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.favlock.example/v1/entries/${secondEntryId}`,
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"kind":"todo"'),
      }),
    );
  });

  it("creates and organizes encrypted Readspace articles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createdResponse(entryId))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createReadspaceEntry(accessToken, values)).resolves.toBe(
      entryId,
    );
    await updateReadspaceOrganization(accessToken, {
      entryId,
      folderId,
      existingTagIds: [tagId],
      newEncryptedTagNames: ["encrypted tag"],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.favlock.example/v1/entries",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"kind":"read"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.favlock.example/v1/entries/${entryId}/readspace-organization`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          folderId,
          existingTagIds: [tagId],
          newEncryptedTagNames: ["encrypted tag"],
        }),
      }),
    );
  });

  it("moves entries between folders through the app API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateEntryFolder(accessToken, {
      entryId,
      kind: "note",
      folderId,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.favlock.example/v1/entries/${entryId}/folder`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ kind: "note", folderId }),
      }),
    );
  });

  it("moves entries to Trash through the app API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteEntry(accessToken, "read", entryId);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.favlock.example/v1/entries/${entryId}/trash`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ kind: "read" }),
      }),
    );
  });

  it("sets Todo completion without creating timestamps in the browser", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await setTodoCompleted(accessToken, entryId, true);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.favlock.example/v1/entries/${entryId}/completion`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ isCompleted: true }),
      }),
    );
  });

  it("fails closed for malformed creation responses and missing sessions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { entryId: "database-id" } }), {
          status: 201,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createEntry(accessToken, "note", values)).rejects.toThrow(
      "Could not create the encrypted entry.",
    );
    await expect(createEntry("", "note", values)).rejects.toThrow(
      "Reconnect to the cloud",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
