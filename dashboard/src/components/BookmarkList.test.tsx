import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../types/bookmark";
import BookmarkList from "./BookmarkList";
import { readOnboardingState } from "../lib/onboarding";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  searchResult: {
    data: undefined as { bookmarks: Bookmark[]; total: number } | undefined,
    isLoading: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
}));

vi.mock("../hooks/useBookmarkLocalSearch", () => ({
  useBookmarkLocalSearch: () => mocks.searchResult,
}));

vi.mock("./BookmarkCard", () => ({
  default: ({
    bookmark,
    searchShortcut,
  }: {
    bookmark: Bookmark;
    searchShortcut?: number;
  }) => (
    <article
      data-bookmark-id={bookmark.id}
      data-search-shortcut={searchShortcut}
    >
      {bookmark.title}
    </article>
  ),
}));

const bookmarks: Bookmark[] = Array.from({ length: 10 }, (_, index) => ({
  id: `bookmark-${index + 1}`,
  user_id: "user-1",
  title: `Bookmark ${index + 1}`,
  url: `https://example.com/${index + 1}`,
  created_at: "2026-01-01T00:00:00.000Z",
  folders: [],
  tags: [],
}));

describe("BookmarkList search shortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    mocks.searchResult.data = { bookmarks, total: bookmarks.length };
    mocks.searchResult.refetch.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("labels only the first nine search results", async () => {
    await act(async () => {
      root.render(
        <BookmarkList
          bookmarks={[]}
          folderId={null}
          searchQuery="example"
        />,
      );
    });

    const cards = container.querySelectorAll("[data-bookmark-id]");
    expect(cards).toHaveLength(10);
    expect(cards[0].getAttribute("data-search-shortcut")).toBe("1");
    expect(cards[8].getAttribute("data-search-shortcut")).toBe("9");
    expect(cards[9].hasAttribute("data-search-shortcut")).toBe(false);
  });

  it("opens the matching result with Command or Control plus its number", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await act(async () => {
      root.render(
        <BookmarkList
          bookmarks={[]}
          folderId={null}
          searchQuery="example"
        />,
      );
    });

    const event = new KeyboardEvent("keydown", {
      key: "3",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith(
      "https://example.com/3",
      "_blank",
      "noopener,noreferrer",
    );
    expect(readOnboardingState("user-1").firstRetrieval).toBe("completed");
  });

  it("does not count displaying search results as retrieval", async () => {
    await act(async () => {
      root.render(
        <BookmarkList
          bookmarks={[]}
          folderId={null}
          searchQuery="example"
        />,
      );
    });

    expect(container.querySelectorAll("[data-bookmark-id]")).toHaveLength(10);
    expect(readOnboardingState("user-1").firstRetrieval).toBe("unknown");
  });

  it("does not register numbered shortcuts outside search mode", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await act(async () => {
      root.render(
        <BookmarkList bookmarks={bookmarks} folderId={null} searchQuery="" />,
      );
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "1",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(open).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-search-shortcut]"),
    ).toBeNull();
  });

  it("does not show or register shortcuts when the preference is disabled", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await act(async () => {
      root.render(
        <BookmarkList
          bookmarks={[]}
          folderId={null}
          searchQuery="example"
          searchShortcutsEnabled={false}
        />,
      );
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "1",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(open).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-search-shortcut]"),
    ).toBeNull();
  });
});
