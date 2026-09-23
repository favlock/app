import { beforeEach, describe, expect, it, vi } from "vitest";
import { editLibraryBatch, librarySelectionId } from "./libraryBulk";
import { editCloudBookmarkBatch, runBookmarkBulkEdit } from "./bookmarkBulk";
import { editCloudEntryBatch } from "./entryBulk";
vi.mock("./bookmarkBulk", async (original) => ({ ...await original<object>(), editCloudBookmarkBatch: vi.fn() }));
vi.mock("./entryBulk", async (original) => ({ ...await original<object>(), editCloudEntryBatch: vi.fn() }));
const context = { local: false, ownerId: "owner", token: "token", assertCurrent: () => {} };
beforeEach(() => vi.resetAllMocks());
describe("mixed library organization", () => {
  it("keeps matching UUIDs in different resource types independent", async () => {
    vi.mocked(editCloudBookmarkBatch).mockResolvedValue([{bookmarkId:"same",status:"updated"}]);
    vi.mocked(editCloudEntryBatch).mockResolvedValue([{entryId:"same",status:"unchanged"}]);
    expect(await editLibraryBatch([librarySelectionId("bookmark","same"), librarySelectionId("note","same")], {action:"collection",folderId:null}, context)).toEqual([
      {bookmarkId:"bookmark:same",status:"updated"},{bookmarkId:"entry:same",status:"unchanged"},
    ]);
  });
  it("preserves acknowledged bookmark success and stops later batches after entry transport failure", async () => {
    const ids = ["bookmark:one", ...Array.from({length:101},(_,i)=>`entry:${i}`)];
    vi.mocked(editCloudBookmarkBatch).mockResolvedValue([{bookmarkId:"one",status:"updated"}]);
    vi.mocked(editCloudEntryBatch).mockRejectedValue(new Error("offline"));
    const results = await runBookmarkBulkEdit(ids, (batch) => editLibraryBatch(batch,{action:"trash"},context),context.assertCurrent,()=>{});
    expect(results).toHaveLength(102);
    expect(results[0]).toEqual({bookmarkId:"bookmark:one",status:"updated"});
    expect(results.slice(1).every((item)=>item.status==="failed")).toBe(true);
    expect(editCloudEntryBatch).toHaveBeenCalledTimes(1);
  });
  it("rejects a mixed favorite action before making any changes", async () => {
    await expect(editLibraryBatch(["bookmark:one","entry:two"],{action:"favorite"},context)).rejects.toThrow("only available for bookmarks");
    expect(editCloudBookmarkBatch).not.toHaveBeenCalled();
    expect(editCloudEntryBatch).not.toHaveBeenCalled();
  });
  it("dispatches task-only actions with task selection keys and rejects mixed types", async () => {
    vi.mocked(editCloudEntryBatch).mockResolvedValue([{entryId:"one",status:"updated"}]);
    expect(await editLibraryBatch([librarySelectionId("todo","one")],{action:"due-date",dueDate:null},context)).toEqual([{bookmarkId:"task:one",status:"updated"}]);
    expect(editCloudEntryBatch).toHaveBeenCalledWith("token",["one"],{action:"due-date",dueDate:null});
    await expect(editLibraryBatch(["task:one","entry:two"],{action:"complete"},context)).rejects.toThrow("only tasks");
  });

});
