import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arrangeFolders,
  createFolder,
  deleteFolder,
  deleteTag,
  updateFolder,
  updateTag,
} from "./taxonomyRepository";

const accessToken = "current.jwt.token";
const folderId = "11111111-1111-4111-8111-111111111111";
const parentId = "22222222-2222-4222-8222-222222222222";
const tagId = "33333333-3333-4333-8333-333333333333";
const createdAt = "2026-08-20T09:00:00.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("taxonomyRepository", () => {
  it("creates an encrypted Collection without sending a user id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { folderId, createdAt } }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createFolder(accessToken, {
        encryptedName: "enc:collection",
        color: "PURPLE",
        parentId: null,
        sortOrder: 3,
      }),
    ).resolves.toEqual({ folderId, createdAt });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/folders",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${accessToken}`,
        }),
        body: JSON.stringify({
          encryptedName: "enc:collection",
          color: "PURPLE",
          parentId: null,
          sortOrder: 3,
        }),
      }),
    );
  });

  it("updates and deletes Collections through narrow routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateFolder(accessToken, folderId, {
      encryptedName: "enc:renamed",
      color: null,
    });
    await deleteFolder(accessToken, folderId);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://api.favlock.example/v1/folders/${folderId}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          encryptedName: "enc:renamed",
          color: null,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.favlock.example/v1/folders/${folderId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("maps local placements to the established complete ordering request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await arrangeFolders(accessToken, [
      { id: folderId, parentId: null, sortOrder: 0 },
      { id: parentId, parentId: folderId, sortOrder: 0 },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.favlock.example/v1/folders/order",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          placements: [
            { folderId, parentId: null, sortOrder: 0 },
            { folderId: parentId, parentId: folderId, sortOrder: 0 },
          ],
        }),
      }),
    );
  });

  it("renames and deletes Tags through narrow routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateTag(accessToken, tagId, "enc:renamed-tag");
    await deleteTag(accessToken, tagId);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://api.favlock.example/v1/tags/${tagId}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ encryptedName: "enc:renamed-tag" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://api.favlock.example/v1/tags/${tagId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("fails closed for malformed creation responses and missing sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { folderId: "database-id", createdAt } }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createFolder(accessToken, {
        encryptedName: "enc:collection",
        color: null,
        parentId: null,
        sortOrder: 0,
      }),
    ).rejects.toThrow("Could not create the encrypted collection.");
    await expect(deleteTag("", tagId)).rejects.toThrow(
      "Please sign in again before continuing.",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
