import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCachedBookmarks } from "./useCachedBookmarks";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getCachedBookmarksForUser: vi.fn(),
  readLocalBookmarks: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    user: { id: "local-vault-a" },
    bookmarkCacheSyncedAt: "2026-09-02T08:00:00.000Z",
    isLocalAccount: true,
  }),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({ cryptoKey: { type: "secret" } as CryptoKey }),
}));

vi.mock("../lib/bookmarkCache", () => ({
  getCachedBookmarksForUser: mocks.getCachedBookmarksForUser,
}));

vi.mock("../lib/localVault", () => ({
  readLocalBookmarks: mocks.readLocalBookmarks,
}));

function Harness() {
  const query = useCachedBookmarks();
  return <div>{query.data?.map((bookmark) => bookmark.title).join(",")}</div>;
}

describe("useCachedBookmarks local vault", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    mocks.getCachedBookmarksForUser.mockReset();
    mocks.readLocalBookmarks.mockReset().mockResolvedValue([
      {
        id: "bookmark-a",
        user_id: "local-vault-a",
        title: "Visible local bookmark",
        url: "https://example.com",
        created_at: "2026-09-02T08:00:00.000Z",
        folders: [],
        tags: [],
      },
    ]);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("renders bookmarks from the encrypted local vault instead of the cloud cache", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      );
    });

    await vi.waitFor(() =>
      expect(container.textContent).toContain("Visible local bookmark"),
    );
    expect(mocks.readLocalBookmarks).toHaveBeenCalledWith(
      "local-vault-a",
      expect.anything(),
    );
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });
});
