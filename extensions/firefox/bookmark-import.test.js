import { afterEach, describe, expect, it, vi } from "vitest";
import { readFirefoxBookmarks } from "./bookmark-import.js";

const message = { type: "favlock.firefox.bookmarks.read" };
const bridgeUrl = "moz-extension://11111111-1111-4111-8111-111111111111/bookmark-import-bridge.html";
const sender = { id: "firefox@favlock.app", url: bridgeUrl };
function setup(allowed) {
  const getTree = vi.fn().mockResolvedValue([{ title: "", children: [{ title: "Test", url: "https://example.com" }] }]);
  const contains = vi.fn().mockResolvedValue(allowed);
  vi.stubGlobal("browser", { runtime: { id: sender.id, getURL: () => bridgeUrl }, permissions: { contains }, bookmarks: { getTree } });
  return { getTree, contains };
}
afterEach(() => vi.unstubAllGlobals());

describe("Firefox background bookmark access", () => {
  it("reads bookmarks only from its bridge and after permission", async () => {
    const { getTree, contains } = setup(true);
    expect(await readFirefoxBookmarks(message, sender)).toMatchObject({ ok: true, tree: expect.any(Array) });
    expect(contains).toHaveBeenCalledWith({ permissions: ["bookmarks"] });
    expect(getTree).toHaveBeenCalledOnce();
  });
  it("does not read when permission is declined", async () => {
    const { getTree } = setup(false);
    expect(await readFirefoxBookmarks(message, sender)).toMatchObject({ ok: false, error: expect.stringContaining("Allow Firefox") });
    expect(getTree).not.toHaveBeenCalled();
  });
  it.each([{ id: "other@example.com", url: bridgeUrl }, { ...sender, url: "https://evil.example" }, { ...sender, url: bridgeUrl + "?fake=1" }])("rejects untrusted senders", async (untrusted) => {
    const { contains, getTree } = setup(true);
    expect(await readFirefoxBookmarks(message, untrusted)).toMatchObject({ ok: false });
    expect(contains).not.toHaveBeenCalled();
    expect(getTree).not.toHaveBeenCalled();
  });
  it("bounds native bookmark trees", async () => {
    const { getTree } = setup(true);
    getTree.mockResolvedValue(Array(100_001).fill({ title: "Test" }));
    await expect(readFirefoxBookmarks(message, sender)).rejects.toThrow("too many");
  });
});
