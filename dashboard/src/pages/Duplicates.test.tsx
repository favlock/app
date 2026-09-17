import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Duplicates from "./Duplicates";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  scanNow: vi.fn(),
  setDailyScanEnabled: vi.fn(),
  setIsMobileSidebarOpen: vi.fn(),
  setMatchMode: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...original,
    useOutletContext: () => ({
      setIsMobileSidebarOpen: mocks.setIsMobileSidebarOpen,
    }),
  };
});

vi.mock("../context/useDuplicateScan", () => ({
  useDuplicateScan: () => ({
    canScan: true,
    deviceState: {
      dailyScanEnabled: true,
      duplicateCount: 2,
      duplicateGroups: [],
      lastScanAt: "2026-09-06T09:00:00.000Z",
      lastScanMatchMode: "tracking",
      matchMode: "tracking",
      nextScanAt: "2026-09-07T09:00:00.000Z",
      scanInProgress: false,
      scannedCount: 10,
      totalCount: 10,
    },
    phase: "complete",
    scanNow: mocks.scanNow,
    setDailyScanEnabled: mocks.setDailyScanEnabled,
    setMatchMode: mocks.setMatchMode,
  }),
}));

vi.mock("../components/BookmarkDuplicateCleanupSection", () => ({
  default: () => <div>Duplicate results</div>,
}));

describe("Duplicates scan options", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render() {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/library-health/duplicates"]}>
          <Duplicates />
        </MemoryRouter>,
      );
    });
  }

  it("changes a setting without scanning and closes when clicking outside", async () => {
    await render();
    const optionsButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Duplicate scan options"]',
    );
    if (!optionsButton) throw new Error("Expected scan options button.");

    act(() => optionsButton.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const exactLabel = Array.from(container.querySelectorAll("label")).find(
      (label) => label.textContent?.includes("Exact URL"),
    );
    const exactInput = exactLabel?.querySelector<HTMLInputElement>(
      'input[type="radio"]',
    );
    if (!exactInput) throw new Error("Expected exact matching option.");

    act(() => exactInput.click());
    expect(mocks.setMatchMode).toHaveBeenCalledWith("exact");
    expect(mocks.scanNow).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(optionsButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes with Escape and restores focus to the options button", async () => {
    await render();
    const optionsButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Duplicate scan options"]',
    );
    if (!optionsButton) throw new Error("Expected scan options button.");

    act(() => optionsButton.click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(optionsButton);
  });
});
