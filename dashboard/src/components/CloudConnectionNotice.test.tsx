import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CloudConnectionNotice from "./CloudConnectionNotice";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("../context/useAuth", () => ({ useAuth }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("CloudConnectionNotice offline export", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    useAuth.mockReturnValue({ user: { id: "local-user" }, cloudStatus: "unavailable" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render() {
    await act(async () => root.render(<MemoryRouter><CloudConnectionNotice /></MemoryRouter>));
  }

  it("removes the export link on disconnect, even before Auth updates its status", async () => {
    await render();
    expect(container.querySelector('a[href="/settings#export-data"]')).not.toBeNull();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(container.querySelector('a[href="/settings#export-data"]')).toBeNull();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(container.querySelector('a[href="/settings#export-data"]')).not.toBeNull();
  });

  it("does not offer export for the offline Auth state", async () => {
    useAuth.mockReturnValue({ user: { id: "local-user" }, cloudStatus: "offline" });
    await render();
    expect(container.textContent).not.toContain("Export local data");
  });

  it.each(["restricted", "reconnect_required", "unavailable"])("preserves online local export for %s accounts", async (cloudStatus) => {
    useAuth.mockReturnValue({ user: { id: "local-user" }, cloudStatus });
    await render();
    expect(container.querySelector('a[href="/settings#export-data"]')).not.toBeNull();
  });
});
