import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookmarkLimitRecovery, { BookmarkLimitGraceNotice } from "./BookmarkLimitRecovery";

const mocks = vi.hoisted(() => ({
  deleteBookmark: vi.fn(),
  refetchPlan: vi.fn(),
}));

vi.mock("../hooks/useBookmarksQuery", () => ({
  useBookmarks: () => ({
    data: [{
      id: "11111111-1111-4111-8111-111111111111",
      title: "Newest bookmark",
      url: "https://example.com/newest",
      created_at: "2026-08-31T10:00:00.000Z",
    }],
  }),
  useDeleteBookmark: () => ({ mutateAsync: mocks.deleteBookmark, isPending: false }),
}));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({ refetch: mocks.refetchPlan }),
}));
vi.mock("./DataExportSection", () => ({ default: () => <p>Export controls</p> }));
vi.mock("./BillingSection", () => ({ default: () => <p>Upgrade controls</p> }));

const access = {
  mode: "recovery" as const,
  count: 10_000,
  limit: 1_000,
  graceEndsAt: "2026-09-30T00:00:00.000Z",
  cleanupAt: "2027-02-27T00:00:00.000Z",
};

describe("bookmark limit recovery", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mocks.deleteBookmark.mockReset().mockResolvedValue(undefined);
    mocks.refetchPlan.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("explains grace restrictions and the deadline", async () => {
    await act(async () => root.render(<BookmarkLimitGraceNotice access={{ ...access, mode: "grace" }} />));
    expect(container.textContent).toContain("creating, importing, or restoring bookmarks is paused");
    expect(container.textContent).toContain("9,000 bookmarks");
  });

  it("keeps export, upgrade, support, and bookmark deletion available", async () => {
    await act(async () => root.render(<BookmarkLimitRecovery access={access} />));

    expect(container.textContent).toContain("Bookmark recovery mode");
    expect(container.textContent).toContain("Export controls");
    expect(container.textContent).toContain("Upgrade controls");
    expect(container.textContent).toContain("oldest 1,000");
    expect(container.querySelector('a[href="mailto:support@favlock.app"]')).not.toBeNull();

    const deleteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete",
    );
    await act(async () => deleteButton?.click());
    expect(mocks.deleteBookmark).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(mocks.refetchPlan).toHaveBeenCalledOnce();
  });
});
