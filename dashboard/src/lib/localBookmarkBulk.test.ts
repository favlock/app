import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { encryptField, importRawKey } from "./encryption";
import { createLocalBookmark, createLocalFolder, editLocalBookmarkBatch, readLocalBookmarks, readLocalTags } from "./localVault";

beforeEach(() => { Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() }); });
async function setup() {
  const vault = "bulk-test-vault";
  const key = await importRawKey("12345678901234567890123456789012");
  const title = await encryptField("Private title", key);
  const url = await encryptField("https://private.example", key);
  const first = await createLocalBookmark(vault, { encryptedTitle: title, encryptedUrl: url, folderId: null, existingTagIds: [], newEncryptedTagNames: [await encryptField("One", key)] });
  const second = await createLocalBookmark(vault, { encryptedTitle: title, encryptedUrl: url, folderId: null, existingTagIds: [], newEncryptedTagNames: [await encryptField("Two", key)] });
  const tags = await readLocalTags(vault, key);
  return { vault, key, first, second, tags };
}
describe("local bulk bookmark edits", () => {
  it("adds/removes only selected tags and preserves protected fields", async () => {
    const { vault, key, first, second, tags } = await setup();
    const one = tags.find((tag) => tag.name === "One")!;
    const two = tags.find((tag) => tag.name === "Two")!;
    const result = await editLocalBookmarkBatch(vault, [first, second], { action: "add-tags", tagIds: [one.id] }, () => {});
    expect(result.map((item) => item.status)).toEqual(["unchanged", "updated"]);
    expect((await readLocalBookmarks(vault, key)).find((item) => item.id === second)).toMatchObject({ title: "Private title", url: "https://private.example", tags: expect.arrayContaining([{ ...one }, { ...two }]) });
    await editLocalBookmarkBatch(vault, [first, second], { action: "remove-tags", tagIds: [one.id] }, () => {});
    const rows = await readLocalBookmarks(vault, key);
    expect(rows.find((item) => item.id === first)?.tags).toEqual([]);
    expect(rows.find((item) => item.id === second)?.tags?.map((tag) => tag.id)).toEqual([two.id]);
    expect(await readLocalTags(vault, key)).toHaveLength(2);
  });
  it("moves, favorites, and permanently deletes local items", async () => {
    const { vault, key, first, second } = await setup();
    const folder = await createLocalFolder(vault, { encryptedName: await encryptField("Collection", key), color: null, parentId: null, sortOrder: 0 });
    await editLocalBookmarkBatch(vault, [first, second], { action: "collection", folderId: folder.id }, () => {});
    await editLocalBookmarkBatch(vault, [first, second], { action: "favorite" }, () => {});
    expect((await readLocalBookmarks(vault, key)).every((item) => item.is_favorite && item.folders?.[0]?.id === folder.id)).toBe(true);
    await editLocalBookmarkBatch(vault, [first, second], { action: "trash" }, () => {});
    expect(await readLocalBookmarks(vault, key)).toEqual([]);
  });
  it("does not write to another vault or accept its tags", async () => {
    const { vault, key, first, tags } = await setup();
    expect(await editLocalBookmarkBatch("another-vault", [first], { action: "favorite" }, () => {})).toEqual([{ bookmarkId: first, status: "not-found" }]);
    await expect(editLocalBookmarkBatch("another-vault", [first], { action: "add-tags", tagIds: [tags[0].id] }, () => {})).rejects.toThrow("no longer available");
    expect((await readLocalBookmarks(vault, key))[0].is_favorite).toBe(false);
  });
  it("aborts the batch if the vault closes during IndexedDB work", async () => {
    const { vault, key, first, second } = await setup();
    let checks = 0;
    await expect(editLocalBookmarkBatch(vault, [first, second], { action: "favorite" }, () => { if (++checks === 5) throw new Error("locked"); })).rejects.toThrow("locked");
    expect((await readLocalBookmarks(vault, key)).every((item) => !item.is_favorite)).toBe(true);
  });
});
