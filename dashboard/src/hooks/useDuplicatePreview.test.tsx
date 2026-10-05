import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDuplicatePreview } from "./useDuplicatePreview";

const mocks = vi.hoisted(() => ({
  getCachedBookmarksForUser: vi.fn(),
  readLocalBookmarks: vi.fn(),
  useAuth: vi.fn(),
  useEncryption: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({ useAuth: mocks.useAuth }));
vi.mock("../context/useEncryption", () => ({
  useEncryption: mocks.useEncryption,
}));
vi.mock("../lib/bookmarkCache", () => ({
  getCachedBookmarksForUser: mocks.getCachedBookmarksForUser,
}));
vi.mock("../lib/localVault", () => ({
  readLocalBookmarks: mocks.readLocalBookmarks,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const bookmarks = [
  {
    id: "old",
    title: "Old",
    url: "https://example.com/article",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "new",
    title: "New",
    url: "https://example.com/article?utm_source=email",
    created_at: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "highlight",
    title: "Highlight source",
    url: "https://example.com/article",
    created_at: "2026-03-01T00:00:00.000Z",
    is_highlight_source: true,
  },
];

function Probe({ enabled }: { enabled: boolean }) {
  const preview = useDuplicatePreview(enabled);
  return (
    <span>
      {preview.status === "ready"
        ? `ready|${preview.scannedCount}|${preview.duplicateCount}|${preview.groups.length}`
        : preview.status}
    </span>
  );
}

describe("useDuplicatePreview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.getCachedBookmarksForUser.mockReset().mockResolvedValue(bookmarks);
    mocks.readLocalBookmarks.mockReset().mockResolvedValue(bookmarks);
    mocks.useAuth.mockReturnValue({
      bookmarkCacheSyncedAt: "2026-09-06T09:00:00.000Z",
      bookmarkCacheSyncing: false,
      isLocalAccount: false,
      libraryCacheHydrating: false,
      user: { id: "user-1" },
    });
    mocks.useEncryption.mockReturnValue({ cryptoKey: {} as CryptoKey });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderProbe(enabled = true) {
    await act(async () => {
      root.render(<Probe enabled={enabled} />);
    });
  }

  it("counts duplicates from the cached library without highlight sources", async () => {
    await renderProbe();

    await vi.waitFor(() => expect(container.textContent).toBe("ready|2|1|1"));
    expect(mocks.getCachedBookmarksForUser).toHaveBeenCalledWith("user-1");
    expect(mocks.readLocalBookmarks).not.toHaveBeenCalled();
  });

  it("reads local vault bookmarks with the unlocked key", async () => {
    const cryptoKey = {} as CryptoKey;
    mocks.useEncryption.mockReturnValue({ cryptoKey });
    mocks.useAuth.mockReturnValue({
      ...mocks.useAuth(),
      isLocalAccount: true,
    });
    await renderProbe();

    await vi.waitFor(() => expect(container.textContent).toBe("ready|2|1|1"));
    expect(mocks.readLocalBookmarks).toHaveBeenCalledWith("user-1", cryptoKey);
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });

  it("does not read bookmarks when disabled", async () => {
    await renderProbe(false);

    expect(container.textContent).toBe("unavailable");
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });

  it("does not read bookmarks while the library is locked", async () => {
    mocks.useEncryption.mockReturnValue({ cryptoKey: null });
    await renderProbe();

    expect(container.textContent).toBe("unavailable");
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });

  it("waits for the bookmark cache to finish syncing", async () => {
    mocks.useAuth.mockReturnValue({
      ...mocks.useAuth(),
      bookmarkCacheSyncing: true,
    });
    await renderProbe();

    expect(container.textContent).toBe("loading");
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });

  it("reports a failed library read", async () => {
    mocks.getCachedBookmarksForUser.mockRejectedValue(new Error("IndexedDB failed"));
    await renderProbe();

    await vi.waitFor(() => expect(container.textContent).toBe("error"));
  });
});
