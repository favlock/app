import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkHealthProvider } from "./LinkHealthContext";
import { useLinkHealth } from "./useLinkHealth";

const mocks = vi.hoisted(() => ({
  accountPlanId: "pro",
  checkLinkHealthBatch: vi.fn(),
  deleteLinkHealthResults: vi.fn(),
  getCachedBookmarksForUser: vi.fn(),
  pruneLinkHealthResults: vi.fn(),
  readLinkHealthResults: vi.fn(),
  useAuth: vi.fn(),
  useEncryption: vi.fn(),
  writeLinkHealthResults: vi.fn(),
}));

vi.mock("./useAuth", () => ({ useAuth: mocks.useAuth }));
vi.mock("./useEncryption", () => ({ useEncryption: mocks.useEncryption }));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({ data: { id: mocks.accountPlanId } }),
}));
vi.mock("../lib/bookmarkCache", () => ({
  getCachedBookmarksForUser: mocks.getCachedBookmarksForUser,
}));
vi.mock("../lib/linkHealthApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/linkHealthApi")>()),
  checkLinkHealthBatch: mocks.checkLinkHealthBatch,
}));
vi.mock("../lib/linkHealthStorage", () => ({
  deleteLinkHealthResults: mocks.deleteLinkHealthResults,
  pruneLinkHealthResults: mocks.pruneLinkHealthResults,
  readLinkHealthResults: mocks.readLinkHealthResults,
  writeLinkHealthResults: mocks.writeLinkHealthResults,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const { applyRemoval, deviceState, pauseScan, phase, scanNow, setAutomaticScanEnabled } = useLinkHealth();
  return (
    <div>
      <span>{phase}|{deviceState.scannedCount}|{deviceState.brokenCount}|{deviceState.automaticScanEnabled ? "on" : "off"}</span>
      <span data-paused={deviceState.scanPaused} />
      <button type="button" onClick={() => void scanNow()}>Check</button>
      <button type="button" onClick={pauseScan}>Pause</button>
      <button type="button" onClick={() => setAutomaticScanEnabled(true)}>Enable</button>
      <button type="button" onClick={() => void applyRemoval(["one"])}>Remove one</button>
    </div>
  );
}

describe("LinkHealthProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    mocks.accountPlanId = "pro";
    mocks.getCachedBookmarksForUser.mockReset().mockResolvedValue([
      { id: "one", user_id: "user-1", title: "One", url: "https://example.com/article?utm_source=email#top", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "two", user_id: "user-1", title: "Two", url: "https://example.com/article", created_at: "2026-02-01T00:00:00.000Z" },
    ]);
    mocks.checkLinkHealthBatch.mockReset().mockResolvedValue([{ status: "broken", statusCode: 404 }]);
    mocks.readLinkHealthResults.mockReset().mockResolvedValue([]);
    mocks.writeLinkHealthResults.mockReset().mockResolvedValue(undefined);
    mocks.pruneLinkHealthResults.mockReset().mockResolvedValue(undefined);
    mocks.deleteLinkHealthResults.mockReset().mockResolvedValue(undefined);
    mocks.useAuth.mockReturnValue({
      bookmarkCacheSyncedAt: "2026-09-07T08:00:00.000Z",
      bookmarkCacheSyncing: false,
      isLocalAccount: false,
      libraryCacheHydrating: false,
      session: { access_token: "current.jwt.token" },
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
    vi.restoreAllMocks();
  });

  it("checks tracking variants once and fans the result out locally", async () => {
    await act(async () => root.render(<LinkHealthProvider><Probe /></LinkHealthProvider>));
    const checkButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Check")!;
    await act(async () => checkButton.click());
    await vi.waitFor(() => expect(container.textContent).toContain("complete|2|2|off"));

    expect(mocks.checkLinkHealthBatch).toHaveBeenCalledWith(
      "current.jwt.token",
      ["https://example.com/article"],
      expect.any(AbortSignal),
    );
    expect(mocks.writeLinkHealthResults.mock.calls[0][0]).toHaveLength(2);
  });

  it("removes deleted bookmarks from the saved device result", async () => {
    await act(async () => root.render(<LinkHealthProvider><Probe /></LinkHealthProvider>));
    const checkButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Check")!;
    await act(async () => checkButton.click());
    await vi.waitFor(() => expect(container.textContent).toContain("complete|2|2|off"));

    const removeButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Remove one")!;
    await act(async () => removeButton.click());

    expect(mocks.deleteLinkHealthResults).toHaveBeenCalledWith("user-1", ["one"]);
    expect(container.textContent).toContain("complete|2|1|off");
  });

  it("changes automatic scheduling without starting a scan", async () => {
    await act(async () => root.render(<LinkHealthProvider><Probe /></LinkHealthProvider>));
    const enableButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Enable")!;
    await act(async () => enableButton.click());
    await vi.waitFor(() => expect(container.textContent).toContain("idle|0|0|on"));
    expect(mocks.checkLinkHealthBatch).not.toHaveBeenCalled();
  });

  it("does not check links for Free accounts", async () => {
    mocks.accountPlanId = "free";
    await act(async () => root.render(<LinkHealthProvider><Probe /></LinkHealthProvider>));
    const checkButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Check",
    )!;

    await act(async () => checkButton.click());

    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
    expect(mocks.checkLinkHealthBatch).not.toHaveBeenCalled();
    expect(container.textContent).toContain("idle|0|0|off");
  });

  it("pauses an active request and keeps its resumable checkpoint", async () => {
    mocks.checkLinkHealthBatch.mockImplementation(
      (_token, _urls, signal: AbortSignal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("Request cancelled", "AbortError"));
        }, { once: true });
      }),
    );
    await act(async () => root.render(<LinkHealthProvider><Probe /></LinkHealthProvider>));
    const buttons = [...container.querySelectorAll("button")];
    const check = buttons.find((button) => button.textContent === "Check")!;
    const pause = buttons.find((button) => button.textContent === "Pause")!;
    act(() => check.click());
    await vi.waitFor(() => expect(container.textContent).toContain("scanning"));
    act(() => pause.click());
    await vi.waitFor(() => expect(container.textContent).toContain("idle"));
    expect(container.querySelector("[data-paused='true']")).not.toBeNull();
  });
});
