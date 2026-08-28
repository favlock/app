import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CloudConnectionNotice from "./CloudConnectionNotice";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("../context/useAuth", () => ({ useAuth }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function deferredRetry() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("CloudConnectionNotice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
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

  async function retry() {
    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();
    await act(async () => button?.click());
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

  it("shows a retry error while its cloud connection state is still current", async () => {
    useAuth.mockReturnValue({
      user: { id: "local-user" },
      cloudStatus: "reconnect_required",
      retryCloudConnection: vi.fn().mockRejectedValue(new Error("Your session has expired. Sign in again.")),
    });
    await render();
    await retry();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Your session has expired. Sign in again.");
    expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
  });

  it("does not redisplay an old retry error after automatic recovery", async () => {
    const disconnected = {
      user: { id: "local-user" },
      session: null,
      cloudStatus: "reconnect_required",
      retryCloudConnection: vi.fn().mockRejectedValue(new Error("Your session has expired. Sign in again.")),
    };
    useAuth.mockReturnValue(disconnected);
    await render();
    await retry();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    useAuth.mockReturnValue({ ...disconnected, cloudStatus: "available", session: { access_token: "fake-recovered-token" } });
    await render();
    expect(container.querySelector("section")).toBeNull();
    useAuth.mockReturnValue(disconnected);
    await render();

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
  });

  it.each([
    { label: "account", change: { user: { id: "other-local-user" } } },
    { label: "access token", change: { session: { access_token: "fake-new-token" } } },
    { label: "cloud status", change: { cloudStatus: "unavailable" } },
  ])("clears a retry error when the $label changes", async ({ change }) => {
    const initial = {
      user: { id: "local-user" },
      session: { access_token: "fake-old-token" },
      cloudStatus: "available",
      connectionError: "The earlier sign-in link failed.",
      retryCloudConnection: vi.fn().mockRejectedValue(new Error("An earlier retry failed.")),
    };
    useAuth.mockReturnValue(initial);
    await render();
    await retry();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    useAuth.mockReturnValue({ ...initial, ...change });
    await render();

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("ignores a pending retry failure after recovery and a later outage", async () => {
    const pending = deferredRetry();
    const disconnected = {
      user: { id: "local-user" },
      session: null,
      cloudStatus: "reconnect_required",
      retryCloudConnection: vi.fn().mockReturnValue(pending.promise),
    };
    useAuth.mockReturnValue(disconnected);
    await render();
    await retry();
    expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);

    useAuth.mockReturnValue({ ...disconnected, cloudStatus: "available", session: { access_token: "fake-recovered-token" } });
    await render();
    useAuth.mockReturnValue(disconnected);
    await render();
    await act(async () => pending.reject(new Error("Your old session expired.")));

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
  });

  it("does not let an older completion cancel a newer pending retry", async () => {
    const older = deferredRetry();
    const newer = deferredRetry();
    const state = {
      user: { id: "local-user" },
      session: null,
      cloudStatus: "reconnect_required",
      retryCloudConnection: vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise),
    };
    useAuth.mockReturnValue(state);
    await render();
    await retry();
    useAuth.mockReturnValue({ ...state, cloudStatus: "unavailable" });
    await render();
    await retry();
    await act(async () => older.resolve());

    expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
    await act(async () => newer.reject(new Error("The current retry failed.")));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The current retry failed.");
    expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
  });
});
