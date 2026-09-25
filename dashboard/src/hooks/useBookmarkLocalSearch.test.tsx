import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchBookmarkLibrary, useBookmarkLocalSearch } from "./useBookmarkLocalSearch";
import { DEFAULT_LIBRARY_SEARCH_FILTERS } from "../lib/librarySearchFilters";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ local: true, read: vi.fn(), search: vi.fn() }));
vi.mock("../context/useAuth", () => ({ useAuth: () => ({ user: { id: "test" }, isLocalAccount: mocks.local }) }));
vi.mock("../context/useEncryption", () => ({ useEncryption: () => ({ cryptoKey: {} }) }));
vi.mock("../lib/localVault", () => ({ readLocalBookmarks: mocks.read }));
vi.mock("../lib/bookmarkSearchWorkerClient", () => ({ searchCachedBookmarksOffMainThread: mocks.search }));
const sorting = { order: "name-asc" as const, favoritesFirst: false };
function Harness() {
  const result = useBookmarkLocalSearch("article", { offset: 1, limit: 1, sorting });
  return <div>{result.data?.bookmarks.map(({ title }) => title).join(",")}</div>;
}
describe("sorted bookmark search", () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  beforeEach(() => {
    mocks.local = true;
    mocks.search.mockReset().mockResolvedValue({ bookmarks: [], total: 0 });
    mocks.read.mockReset().mockResolvedValue([10, 2, 1].map((n) => ({ id: `${n}`, user_id: "test", title: `Article ${n}`, url: "https://example.test", created_at: "2026-01-01" })));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); client.clear(); });
  async function render() {
    await act(async () => { root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); });
  }
  it("sorts decrypted local results before slicing the requested page", async () => {
    await render();
    await vi.waitFor(() => expect(container.textContent).toBe("Article 2"));
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("forwards sorting to the cloud cache worker", async () => {
    mocks.local = false;
    await render();
    expect(mocks.search).toHaveBeenCalledWith("test", "article", { offset: 1, limit: 1, sorting });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("applies the same filter-only request in a local vault and the cloud cache worker", async () => {
    const filters = { ...DEFAULT_LIBRARY_SEARCH_FILTERS, itemType: "bookmark" as const, field: "title" as const };
    const local = await searchBookmarkLibrary("test", {} as CryptoKey, true, "", { filters });
    expect(local.total).toBe(3);
    mocks.local = false;
    await searchBookmarkLibrary("test", null, false, "", { filters });
    expect(mocks.search).toHaveBeenCalledWith("test", "", expect.objectContaining({ filters }));
  });
});
