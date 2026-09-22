import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSortPreferenceSync, sortPreferencesQueryKey } from "./useSortPreferenceSync";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const prefs = { order: "name-asc", favoritesFirst: true, bookmarksOnly: true };
const mocks = vi.hoisted(() => ({ local: false, plan: "pro", userId: "test", load: vi.fn(), save: vi.fn() }));
vi.mock("../context/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.userId }, session: { access_token: "token" }, isLocalAccount: mocks.local }) }));
vi.mock("./useAccountPlanQuery", () => ({ useAccountPlan: () => ({ data: { id: mocks.plan } }) }));
vi.mock("../lib/sortPreferencesApi", () => ({ loadCloudSortPreferences: mocks.load, saveCloudSortPreferences: mocks.save }));
function Harness() {
  const sync = useSortPreferenceSync();
  return <>
    <output>{JSON.stringify({ value: sync.value, cloud: sync.cloudMode, busy: sync.busy, error: sync.error?.message })}</output>
    <button id="cloud" onClick={() => sync.setMode("cloud")}>Cloud</button>
    <button id="local" onClick={() => sync.setMode("local")}>Local</button>
    <button id="sort" onClick={() => sync.update({ order: "website-desc", favoritesFirst: false, bookmarksOnly: true })}>Sort</button>
  </>;
}
describe("sorting storage synchronization", () => {
  let root: Root; let container: HTMLDivElement; let client: QueryClient;
  beforeEach(() => {
    localStorage.clear(); mocks.local = false; mocks.plan = "pro"; mocks.userId = "test";
    mocks.load.mockReset().mockResolvedValue({ preferences: null, version: 0 });
    mocks.save.mockReset().mockImplementation(async (_token, preferences, version) => ({ preferences, version: version + 1 }));
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    container = document.createElement("div"); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); client.clear(); vi.restoreAllMocks(); });
  async function render() {
    await act(async () => { root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); });
    await vi.waitFor(() => expect(container.textContent).toContain('"busy":false'));
  }
  async function click(id: string) {
    await act(async () => { container.querySelector<HTMLButtonElement>(`#${id}`)!.click(); });
  }
  it("keeps device mode by default without uploading basic sort changes", async () => {
    await render(); await click("sort");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(localStorage.getItem("favlock.bookmark-sorting.v1:test")).toContain("website-desc");
  });
  it("enables cloud with current device preferences and their observed revision", async () => {
    localStorage.setItem("favlock.bookmark-sorting.v1:test", JSON.stringify(prefs));
    await render(); await click("cloud");
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith("token", prefs, 0));
    await vi.waitFor(() => expect(container.textContent).toContain('"cloud":true'));
  });
  it("loads another device's sorting and reflects refreshed cloud settings", async () => {
    mocks.load.mockResolvedValue({ preferences: prefs, version: 4 });
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain("name-asc"));
    await act(async () => { client.setQueryData(sortPreferencesQueryKey("test"), { preferences: { ...prefs, order: "saved-asc" }, version: 5 }); });
    await vi.waitFor(() => expect(container.textContent).toContain("saved-asc"));
  });
  it("saves later sort changes against the cloud revision", async () => {
    mocks.load.mockResolvedValue({ preferences: prefs, version: 4 });
    await render(); await click("sort");
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith("token", { order: "website-desc", favoritesFirst: false, bookmarksOnly: true }, 4));
    await vi.waitFor(() => expect(container.textContent).toContain('"busy":false'));
    expect(container.textContent).toContain("website-desc");
  });
  it("does not write a completed save into a different account", async () => {
    let finish!: (value: unknown) => void;
    mocks.save.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(); await click("cloud");
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalled());
    mocks.userId = "other";
    await act(async () => { root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); });
    await act(async () => { finish({ preferences: prefs, version: 1 }); });
    await vi.waitFor(() => expect(container.textContent).toContain('"busy":false'));
    expect(container.textContent).not.toContain("name-asc");
    expect(localStorage.getItem("favlock.bookmark-sorting.v1:other")).toBeNull();
    expect(client.getQueryData(sortPreferencesQueryKey("other"))).toEqual({ preferences: null, version: 0 });
  });
  it("preserves the current device order while clearing cloud preferences", async () => {
    mocks.load.mockResolvedValue({ preferences: prefs, version: 4 });
    await render(); await vi.waitFor(() => expect(container.textContent).toContain("name-asc"));
    await click("local");
    await vi.waitFor(() => expect(container.textContent).toContain('"cloud":false'));
    expect(mocks.save).toHaveBeenCalledWith("token", null, 4);
    expect(localStorage.getItem("favlock.bookmark-sorting.v1:test")).toContain("name-asc");
  });
  it("keeps cloud mode when clearing fails", async () => {
    mocks.load.mockResolvedValue({ preferences: prefs, version: 4 });
    mocks.save.mockRejectedValue(new Error("offline"));
    await render(); await click("local");
    await vi.waitFor(() => expect(container.textContent).toContain("offline"));
    expect(container.textContent).toContain('"cloud":true');
  });
  it("does not remove the cloud copy if device persistence is blocked", async () => {
    mocks.load.mockResolvedValue({ preferences: prefs, version: 4 });
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await click("local");
    await vi.waitFor(() => expect(container.textContent).toContain("cloud copy has been kept"));
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("never contacts the cloud for local vaults", async () => {
    mocks.local = true; mocks.plan = "local";
    await render(); await click("sort");
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("blocks Free uploads but allows removal after downgrade", async () => {
    mocks.plan = "free"; mocks.load.mockResolvedValue({ preferences: prefs, version: 4 });
    await render(); await click("cloud");
    await vi.waitFor(() => expect(container.textContent).toContain("requires FavLock Pro"));
    expect(mocks.save).not.toHaveBeenCalled();
    await click("local");
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith("token", null, 4));
  });
});
