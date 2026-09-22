import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrokenLinks from "./BrokenLinks";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  recordBookmarkOpen: vi.fn(),
  applyRemoval: vi.fn(),
  deleteBookmark: vi.fn(),
  loadStoredResults: vi.fn(),
  results: [] as Array<{
    bookmark: { id: string; user_id: string; title: string; url: string; created_at: string };
    checkedAt: string;
    status: "broken" | "redirected" | "restricted" | "unverified" | "working";
    statusCode?: number;
  }>,
  scanNow: vi.fn(),
  setAutomaticScanEnabled: vi.fn(),
  setIsMobileSidebarOpen: vi.fn(),
}));

vi.mock("../hooks/useBookmarkUsage", () => ({ useRecordBookmarkOpen: () => mocks.recordBookmarkOpen }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useOutletContext: () => ({ setIsMobileSidebarOpen: mocks.setIsMobileSidebarOpen }),
}));
vi.mock("../context/useAuth", () => ({ useAuth: () => ({ isLocalAccount: false }) }));
vi.mock("../context/useLinkHealth", () => ({
  useLinkHealth: () => ({
    applyRemoval: mocks.applyRemoval,
    canScan: true,
    deviceState: {
      automaticScanEnabled: false,
      brokenCount: 1,
      lastScanAt: "2026-09-07T08:00:00.000Z",
      nextScanAt: null,
      scanInProgress: false,
      scanPaused: false,
      scanStartedAt: null,
      scannedCount: 2,
      totalCount: 2,
    },
    error: null,
    loadStoredResults: mocks.loadStoredResults,
    pauseScan: vi.fn(),
    phase: "complete",
    results: mocks.results,
    scanNow: mocks.scanNow,
    setAutomaticScanEnabled: mocks.setAutomaticScanEnabled,
  }),
}));
vi.mock("../hooks/useBookmarksQuery", () => ({
  useDeleteBookmark: () => ({ mutateAsync: mocks.deleteBookmark }),
}));

describe("BrokenLinks", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.results = [{
      bookmark: { id: "one", user_id: "user-1", title: "Missing page", url: "https://example.com/missing", created_at: "2026-01-01T00:00:00.000Z" },
      checkedAt: "2026-09-07T08:00:00.000Z",
      status: "broken",
      statusCode: 404,
    }];
    mocks.loadStoredResults.mockResolvedValue(undefined);
    mocks.applyRemoval.mockResolvedValue(undefined);
    mocks.deleteBookmark.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderPage() {
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/library-health/broken-links"]}>
        <BrokenLinks />
      </MemoryRouter>,
    ));
  }

  it("changes automatic checking without scanning and closes outside", async () => {
    await renderPage();
    const options = container.querySelector<HTMLButtonElement>('[aria-label="Broken link scan options"]')!;
    act(() => options.click());
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    act(() => checkbox.click());
    expect(mocks.setAutomaticScanEnabled).toHaveBeenCalledWith(true);
    expect(mocks.scanNow).not.toHaveBeenCalled();

    act(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders the compact result grid without a search control", async () => {
    await renderPage();
    expect(container.textContent).toContain("Missing page");
    expect(container.textContent).toContain("HTTP 404");
    expect(container.querySelector("article")?.className).toContain("bg-red-500/8");
    expect(container.querySelector('[placeholder="Search links"]')).toBeNull();
  });

  it("moves selected broken bookmarks to Trash and removes their saved results", async () => {
    await renderPage();
    const moveButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Move 1 to Trash"),
    );
    if (!moveButton) throw new Error("Expected move-to-Trash action.");

    await act(async () => moveButton.click());

    expect(mocks.deleteBookmark).toHaveBeenCalledWith("one");
    expect(mocks.applyRemoval).toHaveBeenCalledWith(["one"]);
    expect(container.textContent).toContain("1 bookmark moved to Trash.");
  });

  it("does not show a response label when no HTTP status exists", async () => {
    mocks.results = [{
      bookmark: { id: "one", user_id: "user-1", title: "Unreachable page", url: "https://missing.example", created_at: "2026-01-01T00:00:00.000Z" },
      checkedAt: "2026-09-07T08:00:00.000Z",
      status: "broken",
    }];

    await renderPage();
    expect(container.textContent).not.toContain("No response");
    expect(container.textContent).not.toContain("HTTP");
  });

  it("shows only confirmed broken links", async () => {
    mocks.results = [
      {
        bookmark: { id: "broken", user_id: "user-1", title: "Broken page", url: "https://example.com/missing", created_at: "2026-01-01T00:00:00.000Z" },
        checkedAt: "2026-09-07T08:00:00.000Z",
        status: "broken",
        statusCode: 404,
      },
      {
        bookmark: { id: "restricted", user_id: "user-1", title: "Restricted page", url: "https://500px.com/", created_at: "2026-01-01T00:00:00.000Z" },
        checkedAt: "2026-09-07T08:00:00.000Z",
        status: "restricted",
        statusCode: 403,
      },
      {
        bookmark: { id: "redirected", user_id: "user-1", title: "Redirected page", url: "https://example.com/old", created_at: "2026-01-01T00:00:00.000Z" },
        checkedAt: "2026-09-07T08:00:00.000Z",
        status: "redirected",
        statusCode: 301,
      },
    ];

    await renderPage();
    expect(container.textContent).toContain("Broken page");
    expect(container.textContent).not.toContain("Restricted page");
    expect(container.textContent).not.toContain("Redirected page");
  });

  it("counts a middle-clicked bookmark open", async () => {
    await renderPage();
    const link = container.querySelector<HTMLAnchorElement>('[aria-label="Open Missing page"]')!;
    act(() => link.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 })));
    expect(mocks.recordBookmarkOpen).toHaveBeenCalledExactlyOnceWith("one");
  });

  it("renders large result sets incrementally", async () => {
    mocks.results = Array.from({ length: 121 }, (_, index) => ({
      bookmark: {
        id: `bookmark-${index}`,
        user_id: "user-1",
        title: `Missing page ${index}`,
        url: `https://example.com/missing/${index}`,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      checkedAt: "2026-09-07T08:00:00.000Z",
      status: "broken" as const,
      statusCode: 404,
    }));

    await renderPage();
    expect(container.querySelectorAll("article")).toHaveLength(120);

    const showMore = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Show more"),
    );
    expect(showMore).toBeDefined();
    act(() => showMore?.click());
    expect(container.querySelectorAll("article")).toHaveLength(121);
  });
});
