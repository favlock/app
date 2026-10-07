import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DuplicatePreview } from "../hooks/useDuplicatePreview";
import LibraryHealthPreviewBadge from "./LibraryHealthPreviewBadge";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  preview: { status: "loading" } as DuplicatePreview,
}));

vi.mock("../context/useSharedDuplicatePreview", () => ({
  useSharedDuplicatePreview: () => mocks.preview,
}));

describe("LibraryHealthPreviewBadge", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.preview = { status: "loading" };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderBadge() {
    await act(async () => {
      root.render(<LibraryHealthPreviewBadge />);
    });
    return container.querySelector("span");
  }

  it("shows the duplicate count next to the Pro marker", async () => {
    mocks.preview = {
      status: "ready",
      scannedCount: 1_500,
      duplicateCount: 1_204,
      groups: [],
    };
    const badge = await renderBadge();

    const [count, pro] = [...(badge?.querySelectorAll("span") ?? [])];
    expect(count.textContent).toBe((1_204).toLocaleString());
    expect(pro.textContent).toBe("Pro");
    expect(count.getAttribute("aria-hidden")).toBe("true");
    expect(pro.getAttribute("aria-hidden")).toBe("true");
    expect(badge?.getAttribute("aria-label")).toBe(
      `${(1_204).toLocaleString()} duplicate bookmarks found. Review with FavLock Pro.`,
    );
  });

  it("uses singular wording for one duplicate", async () => {
    mocks.preview = {
      status: "ready",
      scannedCount: 2,
      duplicateCount: 1,
      groups: [],
    };
    const badge = await renderBadge();

    expect(badge?.getAttribute("aria-label")).toBe(
      "1 duplicate bookmark found. Review with FavLock Pro.",
    );
  });

  it.each<DuplicatePreview>([
    { status: "loading" },
    { status: "unavailable" },
    { status: "error" },
    { status: "ready", scannedCount: 10, duplicateCount: 0, groups: [] },
  ])("keeps the Pro badge when there is nothing to show ($status)", async (preview) => {
    mocks.preview = preview;
    const badge = await renderBadge();

    expect(badge?.textContent).toBe("Pro");
    expect(badge?.getAttribute("aria-label")).toBe("FavLock Pro feature");
  });
});
