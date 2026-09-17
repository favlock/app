import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptFile } from "../lib/fileEncryption";
import { downloadEncryptedFile } from "../lib/filesApi";
import { deleteFile, uploadFile } from "../lib/fileRepository";
import Files from "./Files";

const mocks = vi.hoisted(() => ({
  isLocalAccount: false,
  cryptoKey: {} as CryptoKey | null,
  triggerUnlock: vi.fn(),
  refetch: vi.fn(),
  fileList: {
    files: [] as Array<Record<string, unknown>>,
    pendingFiles: [] as Array<{id:string; ciphertextBytes:number; createdAt:string}>,
    usage: {
      usedBytes: 0,
      limitBytes: 52_428_800,
      maxCiphertextBytes: 10_485_945,
    },
  },
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    session: { access_token: "current.access.token" },
    isLocalAccount: mocks.isLocalAccount,
  }),
}));
vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({
    cryptoKey: mocks.cryptoKey,
    keyLoading: false,
    triggerUnlock: mocks.triggerUnlock,
  }),
}));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({ data: { id: "free" } }),
}));
vi.mock("../hooks/useFilesQuery", () => ({
  useFiles: () => ({
    data: mocks.fileList,
    isLoading: false,
    error: null,
    refetch: mocks.refetch,
  }),
}));
vi.mock("../lib/fileRepository", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));
vi.mock("../lib/filesApi", () => ({
  downloadEncryptedFile: vi.fn(),
}));
vi.mock("../lib/fileEncryption", () => ({
  FREE_FILE_MAX_BYTES: 10 * 1024 * 1024,
  PRO_FILE_MAX_BYTES: 100 * 1024 * 1024,
  decryptFileMetadata: vi.fn(async () => ({
    fileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "private-contract.pdf",
    mimeType: "application/pdf",
    size: 2048,
    lastModified: 1_788_806_400_000,
  })),
  decryptFile: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("Files page", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function renderPage() {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/files"]}>
          <Routes>
            <Route
              element={<Outlet context={{ setIsMobileSidebarOpen: vi.fn(), openAddBookmark: vi.fn() }} />}
            >
              <Route path="files" element={<Files />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  beforeEach(() => {
    mocks.isLocalAccount = false;
    mocks.cryptoKey = {} as CryptoKey;
    mocks.fileList.files = [];
    mocks.fileList.pendingFiles = [];
    mocks.triggerUnlock.mockReset();
    mocks.refetch.mockReset().mockResolvedValue({ data: mocks.fileList });
    vi.mocked(uploadFile).mockReset().mockResolvedValue("file-id");
    vi.mocked(deleteFile).mockReset().mockResolvedValue();
    vi.mocked(downloadEncryptedFile).mockReset();
    vi.mocked(decryptFile).mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("explains the encrypted empty state and plaintext download boundary", async () => {
    await renderPage();
    expect(container.textContent).toContain("Your encrypted file space is ready");
    expect(container.textContent).toContain("encrypted on this device first");
    expect(container.textContent).toContain("A downloaded copy is no longer protected by FavLock");
  });

  it("keeps encrypted cloud storage out of local-only vaults", async () => {
    mocks.isLocalAccount = true;
    await renderPage();
    expect(container.textContent).toContain("Cloud account required");
    expect(container.textContent).toContain("not available in a local-only vault");
  });

  it("asks the user to unlock before selecting files", async () => {
    mocks.cryptoKey = null;
    await renderPage();
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[data-headlessui-state]")?.click();
    });
    expect(mocks.triggerUnlock).toHaveBeenCalledOnce();
  });

  it("uploads selected files through the encrypted repository", async () => {
    await renderPage();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["%PDF-1.7"], "contract.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(uploadFile).toHaveBeenCalledWith(
      file,
      mocks.cryptoKey,
      "current.access.token",
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("reports the batch limit instead of silently skipping selected files", async () => {
    await renderPage();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const files = Array.from({ length: 11 }, (_, index) =>
      new File(["%PDF-1.7"], `contract-${index}.pdf`, { type: "application/pdf" }),
    );
    Object.defineProperty(input, "files", { configurable: true, value: files });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Choose up to 10 files at a time.");
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("decrypts filenames locally for display and search", async () => {
    mocks.fileList.files = [{
      id: "019d1a27-1ec0-7e01-8a7e-5ca14e699099",
      encryptedMetadata: "enc:metadata",
      wrappedKey: "fwk:2:key",
      ciphertextBytes: 1_048_617,
      formatVersion: 2,
      createdAt: "2026-09-07T08:00:00.000Z",
      updatedAt: "2026-09-07T08:00:01.000Z",
    }];
    await renderPage();
    expect(container.textContent).toContain("private-contract.pdf");
    expect(container.textContent).toContain("PDF · 2.0 KB");
  });

  function preparePreview() {
    URL.createObjectURL = vi.fn(() => "blob:review-plaintext");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    mocks.fileList.files = [{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", encryptedMetadata:"enc:metadata", wrappedKey:"fwk:2:key"}];
    vi.mocked(downloadEncryptedFile).mockResolvedValue(new Blob(["ciphertext"]));
    vi.mocked(decryptFile).mockResolvedValue({blob:new Blob(["plaintext"]),metadata:{fileId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"private-contract.pdf",mimeType:"application/pdf",size:2048,lastModified:1}});
  }

  it("blocks overlapping preview, download, and upload actions until a failed transfer settles", async () => {
    preparePreview();
    mocks.fileList.files.push({ ...mocks.fileList.files[0], id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    let fail!: (error: Error) => void;
    vi.mocked(downloadEncryptedFile).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    await renderPage();
    const previews = container.querySelectorAll<HTMLButtonElement>('[aria-label="Preview private-contract.pdf"]');
    const downloads = container.querySelectorAll<HTMLButtonElement>('[aria-label="Download private-contract.pdf"]');
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["%PDF-1.7"], "other.pdf", { type: "application/pdf" })] });
    await act(async () => {
      // All three events happen before React can render disabled buttons.
      previews[0].click();
      downloads[1].click();
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(downloadEncryptedFile).toHaveBeenCalledOnce();
    expect(uploadFile).not.toHaveBeenCalled();
    expect([...previews, ...downloads].every(button => button.disabled)).toBe(true);
    await act(async () => { fail(new Error("Transfer interrupted")); });
    expect(container.textContent).toContain("Transfer interrupted");
    expect([...previews, ...downloads].every(button => !button.disabled)).toBe(true);
  });

  it("blocks downloads while an upload is encrypting, before progress is reported", async () => {
    preparePreview();
    let finish!: (id: string) => void;
    vi.mocked(uploadFile).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await renderPage();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["%PDF-1.7"], "other.pdf", { type: "application/pdf" })] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    const download = container.querySelector<HTMLButtonElement>('[aria-label="Download private-contract.pdf"]')!;
    expect(download.disabled).toBe(true);
    await act(async () => { download.click(); });
    expect(downloadEncryptedFile).not.toHaveBeenCalled();
    await act(async () => { finish("uploaded"); });
    expect(download.disabled).toBe(false);
  });

  it("clears and revokes an open plaintext preview when the vault locks", async () => {
    preparePreview(); await renderPage();
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Preview private-contract.pdf"]')!.click(); });
    expect(document.querySelector("iframe")).not.toBeNull();
    mocks.cryptoKey = null; await renderPage();
    expect(document.querySelector("iframe")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:review-plaintext");
  });

  it("discards a preview whose decryption finishes after the vault locks", async () => {
    preparePreview();
    let finish!: (value: Awaited<ReturnType<typeof decryptFile>>) => void;
    vi.mocked(decryptFile).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await renderPage();
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Preview private-contract.pdf"]')!.click(); });
    mocks.cryptoKey = null; await renderPage();
    await act(async () => { finish({blob:new Blob(["plaintext"]),metadata:{fileId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"private-contract.pdf",mimeType:"application/pdf",size:2048,lastModified:1}}); });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("makes interrupted uploads discoverable and cancellable after a reload", async () => {
    mocks.fileList.pendingFiles = [{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",ciphertextBytes:1048617,createdAt:"2026-09-10T00:00:00Z"}];
    await renderPage();
    expect(container.textContent).toContain("Unfinished uploads");
    expect(container.textContent).toContain("Cancel upload");
    await act(async () => { Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Cancel upload")!.click(); });
    expect(document.body.textContent).toContain("Permanently delete file?");
    await act(async () => {
      Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Delete permanently")!.click();
    });
    expect(deleteFile).toHaveBeenCalledWith({ id: mocks.fileList.pendingFiles[0]!.id }, "current.access.token");
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});
