import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { encryptField, importRawKey } from "./encryption";
import { createLocalEntry, createLocalFolder, editLocalEntryBatch, readLocalEntries, readLocalTags } from "./localVault";

beforeEach(() => { Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() }); });
async function setup() {
  const vault = "bulk-test-vault";
  const key = await importRawKey("12345678901234567890123456789012");
  const title = await encryptField("Private title", key);
  const url = await encryptField("https://private.example", key);
  const first = await createLocalEntry(vault, "todo", { title, content: url, dueDate: "2026-10-01", folderId: null, existingTagIds: [], newEncryptedTagNames: [await encryptField("One", key)] });
  const second = await createLocalEntry(vault, "todo", { title, content: url, dueDate: "2026-10-01", folderId: null, existingTagIds: [], newEncryptedTagNames: [await encryptField("Two", key)] });
  const tags = await readLocalTags(vault, key);
  return { vault, key, first, second, tags };
}
describe("local bulk entry edits", () => {
  it("adds/removes only selected tags and preserves protected fields", async () => {
    const { vault, key, first, second, tags } = await setup();
    const one = tags.find((tag) => tag.name === "One")!;
    const two = tags.find((tag) => tag.name === "Two")!;
    const result = await editLocalEntryBatch(vault, [first, second], { action: "add-tags", tagIds: [one.id] }, () => {});
    expect(result.map((item) => item.status)).toEqual(["unchanged", "updated"]);
    expect((await readLocalEntries(vault, key)).find((item) => item.id === second)).toMatchObject({ title: "Private title", content: "https://private.example", due_date: "2026-10-01", is_completed: false, tags: expect.arrayContaining([{ ...one }, { ...two }]) });
    await editLocalEntryBatch(vault, [first, second], { action: "remove-tags", tagIds: [one.id] }, () => {});
    const rows = await readLocalEntries(vault, key);
    expect(rows.find((item) => item.id === first)?.tags).toEqual([]);
    expect(rows.find((item) => item.id === second)?.tags?.map((tag) => tag.id)).toEqual([two.id]);
    expect(await readLocalTags(vault, key)).toHaveLength(2);
  });
  it("moves and permanently deletes local items", async () => {
    const { vault, key, first, second } = await setup();
    const folder = await createLocalFolder(vault, { encryptedName: await encryptField("Collection", key), color: null, parentId: null, sortOrder: 0 });
    await editLocalEntryBatch(vault, [first, second], { action: "collection", folderId: folder.id }, () => {});
    expect((await readLocalEntries(vault, key)).every((item) => item.folder?.id === folder.id)).toBe(true);
    await editLocalEntryBatch(vault, [first, second], { action: "trash" }, () => {});
    expect(await readLocalEntries(vault, key)).toEqual([]);
  });
  it("does not write to another vault or accept its tags", async () => {
    const { vault, key, first, tags } = await setup();
    expect(await editLocalEntryBatch("another-vault", [first], { action: "collection", folderId: null }, () => {})).toEqual([{ entryId: first, status: "not-found" }]);
    await expect(editLocalEntryBatch("another-vault", [first], { action: "add-tags", tagIds: [tags[0].id] }, () => {})).rejects.toThrow("no longer available");
    expect((await readLocalEntries(vault, key)).find((item) => item.id === first)?.tags).toHaveLength(1);
  });
  it("aborts the batch if the vault closes during IndexedDB work", async () => {
    const { vault, key, first, second, tags } = await setup();
    let checks = 0;
    await expect(editLocalEntryBatch(vault, [first, second], { action: "remove-tags", tagIds: [tags[0].id] }, () => { if (++checks === 5) throw new Error("locked"); })).rejects.toThrow("locked");
    expect((await readLocalEntries(vault, key)).every((item) => item.tags?.length === 1)).toBe(true);
  });
  it("changes and clears task dates, completes idempotently, and reopens", async () => {
    const {vault,key,first} = await setup();
    const read = async () => (await readLocalEntries(vault,key)).find((item) => item.id === first)!;
    await editLocalEntryBatch(vault,[first],{action:"due-date",dueDate:"2026-12-01"},()=>{});
    expect(await read()).toMatchObject({due_date:"2026-12-01",content:"https://private.example",is_completed:false});
    await editLocalEntryBatch(vault,[first],{action:"complete"},()=>{});
    const before = await read();
    expect(before).toMatchObject({is_completed:true,completed_at:expect.any(String)});
    expect(await editLocalEntryBatch(vault,[first],{action:"complete"},()=>{})).toEqual([{entryId:first,status:"unchanged"}]);
    expect(await read()).toEqual(before);
    await editLocalEntryBatch(vault,[first],{action:"reopen"},()=>{});
    await editLocalEntryBatch(vault,[first],{action:"due-date",dueDate:null},()=>{});
    expect(await read()).toMatchObject({due_date:null,is_completed:false,completed_at:null});
    await expect(editLocalEntryBatch(vault,[first],{action:"due-date",dueDate:"2026-02-30"},()=>{})).rejects.toThrow("valid due date");
    const note = await createLocalEntry(vault,"note",{title:await encryptField("Note",key),content:await encryptField("Content",key),folderId:null,existingTagIds:[],newEncryptedTagNames:[]});
    expect(await editLocalEntryBatch(vault,[note],{action:"complete"},()=>{})).toEqual([{entryId:note,status:"not-found"}]);
  });

});
