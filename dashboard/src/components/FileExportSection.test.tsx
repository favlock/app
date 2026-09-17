import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileExportSection from "./FileExportSection";
import { buildFileExportPart, loadFileExportPlan, type FileExportPlan } from "../lib/fileExport";

const state = vi.hoisted(() => ({
  userId: "test-user", cryptoKey: {} as CryptoKey | null, isLocalAccount: false, triggerUnlock: vi.fn(),
}));
vi.mock("../context/useAuth", () => ({ useAuth: () => ({
  user: { id: state.userId }, session: { access_token: "test-token" }, isLocalAccount: state.isLocalAccount,
}) }));
vi.mock("../context/useEncryption", () => ({ useEncryption: () => ({
  cryptoKey: state.cryptoKey, keyLoading: false, triggerUnlock: state.triggerUnlock,
}) }));
vi.mock("../lib/fileExport", () => ({ buildFileExportPart: vi.fn(), loadFileExportPlan: vi.fn() }));
const plan: FileExportPlan = {
  exportedAt: "2026-09-10T00:00:00Z", fileCount: 2, pendingCount: 1, parts: [[], []],
};
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Files export lifecycle", () => {
  let root: Root;
  let container: HTMLDivElement;
  let mounted: boolean;
  const createUrl = vi.fn(() => "blob:file-export");
  const revokeUrl = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    state.userId = "test-user"; state.cryptoKey = {} as CryptoKey; state.isLocalAccount = false;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
    vi.mocked(loadFileExportPlan).mockResolvedValue(plan);
    vi.mocked(buildFileExportPart).mockResolvedValue(new Blob(["synthetic-zip"], { type: "application/zip" }));
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container); mounted = true;
  });
  afterEach(() => {
    if (mounted) act(() => root.unmount());
    container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  const render = () => act(async () => root.render(<FileExportSection />));
  async function click(text: string) {
    const button = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(text));
    expect(button, text).toBeDefined();
    await act(async () => button!.click());
  }
  async function prepareFirst() { await render(); await click("Check files for export"); await click("Prepare part 1"); }

  it("discloses plaintext downloads and excluded uploads before offering an explicit ZIP link", async () => {
    await render();
    expect(container.textContent).toContain("ZIPs are not encrypted");
    expect(loadFileExportPlan).not.toHaveBeenCalled();
    await click("Check files for export");
    expect(container.textContent).toContain("2 files in 2 ZIP parts");
    expect(container.textContent).toContain("1 unfinished upload is excluded");
    expect(buildFileExportPart).not.toHaveBeenCalled();
    await click("Prepare part 1");
    const link = container.querySelector("a[download]")!;
    expect(link.getAttribute("download")).toBe("favlock-files-2026-09-10-part-1-of-2.zip");
    expect(link.getAttribute("href")).toBe("blob:file-export");
    expect(container.textContent).not.toContain("Prepare next part");
    document.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    await click("Prepare next part");
    expect(revokeUrl).toHaveBeenCalledWith("blob:file-export");
    expect(vi.mocked(buildFileExportPart).mock.calls[1][1]).toBe(1);
    expect(container.querySelector("a[download]")?.getAttribute("download")).toContain("part-2-of-2");
  });

  it("retries the same part after a failure without claiming success", async () => {
    vi.mocked(buildFileExportPart).mockRejectedValueOnce(new Error("sensitive upstream diagnostic"));
    await prepareFirst();
    expect(container.querySelector("a[download]")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Retry this part");
    expect(container.textContent).not.toContain("sensitive");
    await click("Prepare part 1");
    expect(vi.mocked(buildFileExportPart).mock.calls.map((call) => call[1])).toEqual([0, 0]);
    expect(container.querySelector("a[download]")).not.toBeNull();
  });

  it.each(["lock", "account", "unmount", "cancel", "offline"])("rejects late plaintext after %s", async (action) => {
    let finish!: (blob: Blob) => void;
    vi.mocked(buildFileExportPart).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await prepareFirst();
    const signal = vi.mocked(buildFileExportPart).mock.calls[0][4];
    if (action === "lock") { state.cryptoKey = null; await render(); }
    if (action === "account") { state.userId = "other-user"; await render(); }
    if (action === "unmount") { act(() => root.unmount()); mounted = false; }
    if (action === "cancel") await click("Cancel file export");
    if (action === "offline") {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      await act(async () => window.dispatchEvent(new Event("offline")));
    }
    expect(signal.aborted).toBe(true);
    await act(async () => finish(new Blob(["late-plaintext"])));
    expect(createUrl).not.toHaveBeenCalled();
    expect(container.querySelector("a[download]")).toBeNull();
  });

  it("revokes a prepared plaintext URL on lock", async () => {
    await prepareFirst();
    state.cryptoKey = null; await render();
    expect(revokeUrl).toHaveBeenCalledWith("blob:file-export");
    expect(container.querySelector("a[download]")).toBeNull();
    expect(container.textContent).not.toContain("2 files in 2 ZIP parts");
    await click("Unlock to export files");
    expect(state.triggerUnlock).toHaveBeenCalledOnce();
  });

  it("revokes a prepared plaintext URL when unmounted", async () => {
    await prepareFirst();
    act(() => root.unmount()); mounted = false;
    expect(revokeUrl).toHaveBeenCalledWith("blob:file-export");
  });

  it("ignores a late listing when the vault locks", async () => {
    let finish!: (value: FileExportPlan) => void;
    vi.mocked(loadFileExportPlan).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render(); await click("Check files for export");
    state.cryptoKey = null; await render();
    await act(async () => finish(plan));
    expect(container.textContent).not.toContain("2 files in 2 ZIP parts");
  });

  it("does not fetch Files for local accounts or while offline", async () => {
    state.isLocalAccount = true; await render();
    expect(container.textContent).toBe("");
    state.isLocalAccount = false;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await render();
    expect(container.textContent).toContain("Reconnect to export your data");
    expect(container.querySelector("button")).toBeNull();
    expect(loadFileExportPlan).not.toHaveBeenCalled();
  });

  it("reports an empty ready-file snapshot without making a ZIP", async () => {
    vi.mocked(loadFileExportPlan).mockResolvedValue({ ...plan, fileCount: 0, parts: [] });
    await render(); await click("Check files for export");
    expect(container.textContent).toContain("No completed files to export");
    expect(buildFileExportPart).not.toHaveBeenCalled();
    expect(container.querySelector("a")).toBeNull();
  });
});
