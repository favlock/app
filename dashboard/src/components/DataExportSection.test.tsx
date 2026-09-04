import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataExportSection from "./DataExportSection";

const { loadBookmarks, encryptArchive, buildExport, triggerUnlock } = vi.hoisted(() => ({
  loadBookmarks: vi.fn(),
  encryptArchive: vi.fn(),
  buildExport: vi.fn(),
  triggerUnlock: vi.fn(),
}));
const highlights = [{ id: "highlight-1" }];
vi.mock("../context/useAuth", () => ({ useAuth: () => ({ user: { id: "local-user" }, cloudStatus: "available" }) }));
vi.mock("../context/useEncryption", () => ({ useEncryption: () => ({ cryptoKey: {}, keyLoading: false, triggerUnlock }) }));
vi.mock("../hooks/useFoldersQuery", () => ({ useFolders: () => ({ data: [] }) }));
vi.mock("../hooks/useTagsQuery", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../hooks/useListsQuery", () => ({ useLists: () => ({ data: [] }) }));
vi.mock("../hooks/useNotesQuery", () => ({ useNotes: () => ({ data: [] }) }));
vi.mock("../hooks/useTodosQuery", () => ({ useTodos: () => ({ data: [] }) }));
vi.mock("../hooks/useReadspaceQuery", () => ({ useReadspace: () => ({ data: [] }) }));
vi.mock("../hooks/useHighlightsQuery", () => ({ useHighlights: () => ({ data: highlights }) }));
vi.mock("../lib/bookmarkExportRepository", () => ({ loadAllBookmarksForExport: loadBookmarks }));
vi.mock("../lib/dataExport", () => ({ buildFavLockExport: buildExport, buildBrowserBookmarksHtml: vi.fn() }));
vi.mock("../lib/encryptedArchive", () => ({ encryptFavLockArchive: encryptArchive, serializeEncryptedFavLockArchive: () => "synthetic-archive" }));
vi.mock("../lib/offlineDecryptor", () => ({ OFFLINE_DECRYPTOR_FILENAME: "decryptor.html", buildOfflineDecryptorHtml: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("DataExportSection connectivity guard", () => {
  let root: Root;
  let container: HTMLDivElement;
  const createObjectURL = vi.fn(() => "blob:synthetic-export");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    loadBookmarks.mockResolvedValue([]);
    buildExport.mockReturnValue({});
    encryptArchive.mockResolvedValue({});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function exportButton() {
    return Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Download encrypted archive"))!;
  }

  it("shows no download controls while offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => root.render(<DataExportSection />));
    expect(container.textContent).toContain("Reconnect to export your data.");
    expect(container.querySelector("button")).toBeNull();
    expect(loadBookmarks).not.toHaveBeenCalled();
  });

  it("blocks a stale export click before the offline event is delivered", async () => {
    await act(async () => root.render(<DataExportSection />));
    const button = exportButton();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => button.click());
    expect(loadBookmarks).not.toHaveBeenCalled();
    expect(triggerUnlock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("leaves online archive export working", async () => {
    await act(async () => root.render(<DataExportSection />));
    await act(async () => exportButton().click());
    expect(loadBookmarks).toHaveBeenCalledWith("local-user");
    expect(buildExport).toHaveBeenCalledWith(
      expect.objectContaining({ highlights }),
      expect.objectContaining({ bookmarks: true, highlights: true }),
    );
    expect(encryptArchive).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Export downloaded");
  });

  it("does not download if connectivity drops during export preparation", async () => {
    let finishEncryption!: (value: object) => void;
    encryptArchive.mockImplementationOnce(() => new Promise(resolve => { finishEncryption = resolve; }));
    await act(async () => root.render(<DataExportSection />));
    await act(async () => exportButton().click());
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      finishEncryption({});
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Reconnect to export your data.");
    expect(container.textContent).not.toContain("Export downloaded");
  });
});
