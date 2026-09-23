import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../types/bookmark";
import BookmarkBulkEditor from "./BookmarkBulkEditor";
import BookmarkList from "./BookmarkList";
import { readOnboardingState } from "../lib/onboarding";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  key: {} as CryptoKey,
  bulk: vi.fn(),
  allSearch: vi.fn(),
  recordBookmarkOpen: vi.fn(),
  searchResult: {
    data: undefined as { bookmarks: Bookmark[]; total: number } | undefined,
    isLoading: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
}));

vi.mock("../context/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" }, isLocalAccount: false, session: { access_token: "fake-token" }, cloudStatus: "available", retryBookmarkCacheSync: vi.fn() }) }));
vi.mock("../context/useEncryption", () => ({ useEncryption: () => ({ cryptoKey: mocks.key }) }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({ ...await importOriginal<object>(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("../hooks/useFoldersQuery", () => ({ useFolders: () => ({ data: [] }) }));
vi.mock("../hooks/useTagsQuery", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../lib/bookmarkBulk", async (importOriginal) => ({ ...await importOriginal<object>(), editCloudBookmarkBatch: (...args: unknown[]) => mocks.bulk(...args) }));
vi.mock("./ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../hooks/useBookmarkUsage", () => ({ useRecordBookmarkOpen: () => mocks.recordBookmarkOpen }));

vi.mock("../hooks/useBookmarkLocalSearch", () => ({
  useBookmarkLocalSearch: () => mocks.searchResult,
  searchBookmarkLibrary: (...args: unknown[]) => mocks.allSearch(...args),
}));

vi.mock("./BookmarkCard", () => ({
  default: ({
    bookmark,
    searchShortcut,
    selection,
  }: {
    bookmark: Bookmark;
    searchShortcut?: number;
    selection?: { checked: boolean; onToggle: (range: boolean) => void };
  }) => (
    <article
      data-bookmark-id={bookmark.id}
      data-search-shortcut={searchShortcut}
    >
      {bookmark.title}
      {selection && <input type="checkbox" aria-label={`Select ${bookmark.title}`} checked={selection.checked} onChange={() => {}} onClick={(event) => selection.onToggle(event.shiftKey)} />}
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
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
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
    mocks.bulk.mockReset();
    mocks.allSearch.mockReset();
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

  it("offers only shared actions for mixed selections and favorites for bookmark-only selections", async () => {
    const items = [{id:"bookmark:one"}, {id:"entry:two"}];
    await act(async () => root.render(<BookmarkBulkEditor libraryItems shown={items} total={2} loading={false} getAll={async () => items}>
      {(selection) => <button onClick={() => selection.toggle("bookmark:one",false)}>Toggle bookmark</button>}
    </BookmarkBulkEditor>));
    const click = async (text: string) => act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === text)!.click();
    });
    await click("Select items"); await click("Select all"); await click("Actions");
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Change collection");
    expect(document.querySelector('[role="menu"]')?.textContent).not.toContain("favorites");
    await click("Actions"); await click("Clear"); await click("Toggle bookmark"); await click("Actions");
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Add to favorites");
  });


  it("shows task date and completion actions only for task selections", async () => {
    const items = [{id:"task:one"},{id:"entry:two"}];
    await act(async () => root.render(<BookmarkBulkEditor libraryItems shown={items} total={2} loading={false} getAll={async () => items}>
      {(selection) => <><button onClick={() => selection.toggle("task:one",false)}>Toggle task</button><button onClick={() => selection.toggle("entry:two",false)}>Toggle document</button></>}
    </BookmarkBulkEditor>));
    const click = async (text: string) => act(async () => {
      [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === text)!.click();
    });
    await click("Select items"); await click("Toggle task"); await click("Actions");
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Mark as completed");
    expect(document.querySelector('[role="menu"]')?.textContent).toContain("Mark as open");
    await click("Change due date");
    expect(container.querySelector('input[type="date"]')).toBeTruthy();
    expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Change due date (1)")?.disabled).toBe(true);
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Change due date (1)")?.disabled).toBe(false);
    await click("Cancel"); await click("Toggle document"); await click("Actions");
    expect(document.querySelector('[role="menu"]')?.textContent).not.toContain("Change due date");
    expect(document.querySelector('[role="menu"]')?.textContent).not.toContain("Mark as completed");
  });
  it("sorts the complete browse view before the first visible batch", async () => {
    const library = Array.from({ length: 30 }, (_, index) => ({
      ...bookmarks[0],
      id: `item-${index}`,
      title: `Article ${30 - index}`,
    }));
    await act(async () => {
      root.render(
        <BookmarkList
          bookmarks={library}
          folderId={null}
          sorting={{ order: "name-asc", favoritesFirst: false }}
        />,
      );
    });
    const cards = container.querySelectorAll("[data-bookmark-id]");
    expect(cards).toHaveLength(21);
    expect(cards[0].textContent).toBe("Article 1");
    expect(cards[20].textContent).toBe("Article 21");
  });

  it("selects ranges, selects all matching browse items, and clears selection on a filter change", async () => {
    const library = Array.from({ length: 30 }, (_, index) => ({ ...bookmarks[0], id: `item-${index}`, title: `Item ${index}` }));
    const click = async (text: string) => { await act(async () => {
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
      expect(button).toBeTruthy(); button!.click();
    }); };
    await act(async () => root.render(<BookmarkList bookmarks={library} folderId={null} />));
    await click("Select bookmarks");
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => inputs[0].click());
    await act(async () => inputs[3].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })));
    expect(container.textContent).toContain("4 selected");
    expect(container.textContent).not.toContain("Select shown");
    expect([...container.querySelectorAll("button")].filter((button) => button.textContent === "Select all")).toHaveLength(1);
    await click("Select all");
    expect(container.textContent).toContain("30 selected");
    await act(async () => root.render(<BookmarkList bookmarks={library} folderId="favorites" />));
    expect(container.textContent).not.toContain("30 selected");
  });

  it("selects all search results beyond the current page and suppresses open shortcuts during selection", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    mocks.searchResult.data = { bookmarks, total: 120 };
    mocks.allSearch.mockResolvedValue({ bookmarks: Array.from({ length: 120 }, (_, i) => ({ ...bookmarks[0], id: `all-${i}` })) });
    await act(async () => root.render(<BookmarkList bookmarks={[]} folderId={null} searchQuery="example" />));
    await act(async () => [...container.querySelectorAll("button")].find((item) => item.textContent === "Select bookmarks")!.click());
    await act(async () => [...container.querySelectorAll("button")].find((item) => item.textContent === "Select all")!.click());
    expect(container.textContent).toContain("120 selected");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true, bubbles: true })));
    expect(open).not.toHaveBeenCalled();
  });

  it("retains only failed IDs and retries them, preserving feedback when the view empties", async () => {
    mocks.bulk.mockResolvedValueOnce(bookmarks.map((bookmark, index) => ({ bookmarkId: bookmark.id, status: index === 0 ? "failed" : "updated" })));
    mocks.bulk.mockResolvedValueOnce([{ bookmarkId: bookmarks[0].id, status: "updated" }]);
    const click = async (text: string) => { await act(async () => {
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text);
      expect(button).toBeTruthy(); button!.click();
    }); };
    await act(async () => root.render(<BookmarkList bookmarks={bookmarks} folderId={null} />));
    await click("Select bookmarks");
    await click("Select all");
    await click("Actions");
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) => item.textContent === "Add to favorites")!.click(); });
    await click("Add to favorites (10)");
    expect(mocks.bulk).toHaveBeenNthCalledWith(1, "fake-token", bookmarks.map((bookmark) => bookmark.id), { action: "favorite" });
    expect(container.textContent).toContain("1 selected");
    expect(container.textContent).toContain("9 bookmarks updated");
    await click("Retry failed");
    expect(mocks.bulk).toHaveBeenNthCalledWith(2, "fake-token", [bookmarks[0].id], { action: "favorite" });
    await act(async () => root.render(<BookmarkList bookmarks={[]} folderId={null} />));
    expect(container.textContent).toContain("1 bookmark updated");
    expect(container.textContent).toContain("0 selected");
  });

  it("keeps selections across search pages and sorting, but clears them when the query changes", async () => {
    mocks.searchResult.data = { bookmarks, total: 110 };
    await act(async () => root.render(<BookmarkList bookmarks={[]} folderId={null} searchQuery="example" />));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Select bookmarks")!.click());
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Next")!.click());
    mocks.searchResult.data = { bookmarks: [{ ...bookmarks[0], id: "page-two" }], total: 110 };
    await act(async () => root.render(<BookmarkList bookmarks={[]} folderId={null} searchQuery="example" sorting={{ order: "name-asc", favoritesFirst: false }} />));
    expect(container.textContent).toContain("1 selected");
    await act(async () => root.render(<BookmarkList bookmarks={[]} folderId={null} searchQuery="changed" />));
    expect(container.textContent).not.toContain("1 selected");
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
    expect(mocks.recordBookmarkOpen).toHaveBeenCalledExactlyOnceWith("bookmark-3");
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
    expect(mocks.recordBookmarkOpen).not.toHaveBeenCalled();
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
