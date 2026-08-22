import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookmarkSearchShortcutPreference from "./BookmarkSearchShortcutPreference";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  useUserInfo: vi.fn(),
}));

vi.mock("../hooks/useUserInfoQuery", () => ({
  useUserInfo: mocks.useUserInfo,
  useUpdateBookmarkSearchShortcuts: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

describe("BookmarkSearchShortcutPreference", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.mutateAsync.mockReset().mockResolvedValue(false);
    mocks.useUserInfo.mockReset().mockReturnValue({
      data: { bookmark_search_shortcuts_enabled: null },
      isLoading: false,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("treats a null database preference as enabled", async () => {
    await act(async () => {
      root.render(<BookmarkSearchShortcutPreference />);
    });

    expect(
      container.querySelector('[role="checkbox"]')?.getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("treats an explicit false database preference as disabled", async () => {
    mocks.useUserInfo.mockReturnValue({
      data: { bookmark_search_shortcuts_enabled: false },
      isLoading: false,
    });

    await act(async () => {
      root.render(<BookmarkSearchShortcutPreference />);
    });

    expect(
      container.querySelector('[role="checkbox"]')?.getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("saves false when the default-enabled checkbox is cleared", async () => {
    await act(async () => {
      root.render(<BookmarkSearchShortcutPreference />);
    });

    await act(async () => {
      (container.querySelector('[role="checkbox"]') as HTMLElement).click();
    });

    expect(mocks.mutateAsync).toHaveBeenCalledWith(false);
  });
});
