import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateScanProvider } from "./DuplicateScanContext";
import { useDuplicateScan } from "./useDuplicateScan";
import { readDuplicateScanState, writeDuplicateScanState } from "../lib/duplicateScanPreference";

const mocks = vi.hoisted(() => ({
  accountPlanId: "pro",
  getCachedBookmarksForUser: vi.fn(),
  useAuth: vi.fn(),
  useEncryption: vi.fn(),
}));

vi.mock("./useAuth", () => ({ useAuth: mocks.useAuth }));
vi.mock("./useEncryption", () => ({ useEncryption: mocks.useEncryption }));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({ data: { id: mocks.accountPlanId } }),
}));
vi.mock("../lib/bookmarkCache", () => ({
  getCachedBookmarksForUser: mocks.getCachedBookmarksForUser,
}));
vi.mock("../lib/localVault", () => ({ readLocalBookmarks: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const { deviceState, phase } = useDuplicateScan();
  return (
    <span>
      {phase}|{deviceState.scannedCount}|{deviceState.duplicateCount}
    </span>
  );
}

function SettingsProbe() {
  const { deviceState, setDailyScanEnabled, setMatchMode } = useDuplicateScan();
  return (
    <div>
      <span>
        {deviceState.matchMode}|
        {deviceState.dailyScanEnabled ? "on" : "off"}
      </span>
      <button type="button" onClick={() => setMatchMode("query")}>
        Use query matching
      </button>
      <button type="button" onClick={() => setDailyScanEnabled(true)}>
        Enable automatic scans
      </button>
    </div>
  );
}

describe("DuplicateScanProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    mocks.accountPlanId = "pro";
    mocks.getCachedBookmarksForUser.mockReset().mockResolvedValue([
      {
        id: "old",
        user_id: "user-1",
        title: "Old",
        url: "https://example.com/article",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "new",
        user_id: "user-1",
        title: "New",
        url: "https://example.com/article?utm_source=email",
        created_at: "2026-02-01T00:00:00.000Z",
      },
    ]);
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
    vi.restoreAllMocks();
  });

  it("scans after login and schedules the next run 24 hours after completion", async () => {
    await act(async () => {
      root.render(
        <DuplicateScanProvider>
          <Probe />
        </DuplicateScanProvider>,
      );
    });

    await vi.waitFor(() => expect(container.textContent).toBe("complete|2|1"));
    expect(mocks.getCachedBookmarksForUser).toHaveBeenCalledWith("user-1");

    const state = readDuplicateScanState("user-1");
    expect(state.duplicateGroups).toEqual([
      { keeperId: "old", duplicateIds: ["new"] },
    ]);
    expect(
      Date.parse(state.nextScanAt!) - Date.parse(state.lastScanAt!),
    ).toBe(24 * 60 * 60 * 1_000);
  });

  it("keeps a recent saved result without rescanning", async () => {
    const completedAt = new Date().toISOString();
    writeDuplicateScanState("user-1", {
      dailyScanEnabled: true,
      duplicateCount: 3,
      duplicateGroups: [],
      lastScanAt: completedAt,
      lastScanMatchMode: "tracking",
      matchMode: "tracking",
      nextScanAt: new Date(Date.now() + 60_000).toISOString(),
      scanInProgress: false,
      scannedCount: 20,
      totalCount: 20,
    });

    await act(async () => {
      root.render(
        <DuplicateScanProvider>
          <Probe />
        </DuplicateScanProvider>,
      );
    });

    await vi.waitFor(() => expect(container.textContent).toBe("idle|20|3"));
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });

  it("does not scan for Free accounts", async () => {
    mocks.accountPlanId = "free";

    await act(async () => {
      root.render(
        <DuplicateScanProvider>
          <Probe />
        </DuplicateScanProvider>,
      );
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(container.textContent).toBe("idle|0|0");
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });

  it("changes matching preferences without starting a scan or clearing results", async () => {
    const completedAt = new Date().toISOString();
    const nextScanAt = new Date(Date.now() + 60_000).toISOString();
    writeDuplicateScanState("user-1", {
      dailyScanEnabled: true,
      duplicateCount: 1,
      duplicateGroups: [{ keeperId: "old", duplicateIds: ["new"] }],
      lastScanAt: completedAt,
      lastScanMatchMode: "tracking",
      matchMode: "tracking",
      nextScanAt,
      scanInProgress: false,
      scannedCount: 2,
      totalCount: 2,
    });

    await act(async () => {
      root.render(
        <DuplicateScanProvider>
          <SettingsProbe />
        </DuplicateScanProvider>,
      );
    });
    const modeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Use query matching",
    );
    if (!modeButton) throw new Error("Expected matching-mode control.");

    await act(async () => {
      modeButton.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
    expect(readDuplicateScanState("user-1")).toMatchObject({
      duplicateCount: 1,
      duplicateGroups: [{ keeperId: "old", duplicateIds: ["new"] }],
      lastScanAt: completedAt,
      lastScanMatchMode: "tracking",
      matchMode: "query",
      nextScanAt,
      scannedCount: 2,
      totalCount: 2,
    });
  });

  it("enables automatic scans without immediately running an overdue scan", async () => {
    writeDuplicateScanState("user-1", {
      dailyScanEnabled: false,
      duplicateCount: 1,
      duplicateGroups: [{ keeperId: "old", duplicateIds: ["new"] }],
      lastScanAt: "2026-09-01T09:00:00.000Z",
      lastScanMatchMode: "tracking",
      matchMode: "tracking",
      nextScanAt: "2026-09-02T09:00:00.000Z",
      scanInProgress: false,
      scannedCount: 2,
      totalCount: 2,
    });

    await act(async () => {
      root.render(
        <DuplicateScanProvider>
          <SettingsProbe />
        </DuplicateScanProvider>,
      );
    });
    const automaticButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Enable automatic scans");
    if (!automaticButton) throw new Error("Expected automatic-scan control.");

    await act(async () => {
      automaticButton.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(readDuplicateScanState("user-1").dailyScanEnabled).toBe(true);
    expect(mocks.getCachedBookmarksForUser).not.toHaveBeenCalled();
  });
});
