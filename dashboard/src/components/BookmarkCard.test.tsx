import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bookmark, Folder } from "../types/bookmark";
import { getBookmarkShortcutModifier } from "../lib/bookmarkSearchShortcuts";
import BookmarkCard from "./BookmarkCard";
import { readOnboardingState } from "../lib/onboarding";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  moveBookmark: vi.fn(),
  isLocalAccount: { current: false },
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ isLocalAccount: mocks.isLocalAccount.current }),
}));

const folders: Folder[] = [
  {
    id: "current-folder",
    user_id: "user-1",
    name: "Current",
    color: null,
    parent_id: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "new-folder",
    user_id: "user-1",
    name: "New collection",
    color: null,
    parent_id: null,
    sort_order: 1,
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

vi.mock("../hooks/useFoldersQuery", () => ({
  useFolders: () => ({ data: folders }),
}));

vi.mock("../hooks/useTagsQuery", () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock("../hooks/useBookmarksQuery", () => ({
  useDeleteBookmark: () => ({ mutateAsync: vi.fn() }),
  useMoveBookmark: () => ({
    mutateAsync: mocks.moveBookmark,
    isPending: false,
  }),
  useToggleFavorite: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("./AddBookmarkForm", () => ({ default: () => null }));

const bookmark: Bookmark = {
  id: "bookmark-1",
  user_id: "user-1",
  title: "Example",
  url: "https://example.com",
  created_at: "2026-01-01T00:00:00.000Z",
  folders: [folders[0]],
  tags: [],
};

describe("BookmarkCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    mocks.isLocalAccount.current = false;
    mocks.moveBookmark.mockReset().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("warns that local deletion is immediate and Trash requires cloud", async () => {
    mocks.isLocalAccount.current = true;
    await act(async () => {
      root.render(
        <BookmarkCard bookmark={bookmark} onDeleted={() => {}} />,
      );
    });

    const deleteButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Delete bookmark permanently"]',
    )!;
    act(() => deleteButton.click());

    expect(document.body.textContent).toContain("immediately deleted");
    expect(document.body.textContent).toContain("free cloud account");
    expect(document.body.textContent).toContain("7 days");
    expect(document.body.textContent).toContain("Delete permanently");
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens the bookmark when the card surface is clicked", async () => {
    await act(async () => {
      root.render(
        <BookmarkCard
          bookmark={bookmark}
          onDeleted={() => {}}
          onMoved={() => {}}
        />,
      );
    });

    const article = container.querySelector("article")!;
    const bookmarkLink = container.querySelector<HTMLAnchorElement>(
      'a[href="https://example.com"]',
    )!;
    const linkClick = vi
      .spyOn(bookmarkLink, "click")
      .mockImplementation(() => {});

    act(() => article.click());

    expect(linkClick).toHaveBeenCalledOnce();
  });

  it("records retrieval only when the saved bookmark link is deliberately opened", async () => {
    await act(async () => {
      root.render(
        <BookmarkCard
          bookmark={bookmark}
          onDeleted={() => {}}
          onMoved={() => {}}
        />,
      );
    });

    expect(readOnboardingState("user-1").firstRetrieval).toBe("unknown");
    const bookmarkLink = container.querySelector<HTMLAnchorElement>(
      'a[href="https://example.com"]',
    )!;
    bookmarkLink.addEventListener("click", (event) => event.preventDefault());
    await act(async () => bookmarkLink.click());
    expect(readOnboardingState("user-1").firstRetrieval).toBe("completed");
  });

  it("shows the search shortcut hint when one is assigned", async () => {
    await act(async () => {
      root.render(
        <BookmarkCard
          bookmark={bookmark}
          onDeleted={() => {}}
          searchShortcut={3}
        />,
      );
    });

    const shortcut = container.querySelector("kbd");
    expect(shortcut).not.toBeNull();
    expect(shortcut?.textContent).toContain("3");
    expect(shortcut?.getAttribute("aria-label")).toMatch(
      /^Open with (Command|Control) \+ 3$/,
    );
  });

  it("preserves full bookmark, tag, and collection labels when truncated", async () => {
    const title = "A long bookmark title ".repeat(12).trim();
    const tagName = "LongTag".repeat(30);
    const folderName = "LongCollection".repeat(20);
    await act(async () => {
      root.render(
        <BookmarkCard
          bookmark={{
            ...bookmark,
            title,
            tags: [{ id: "long-tag", user_id: "user-1", name: tagName, created_at: bookmark.created_at }],
            folders: [{ ...folders[0], id: "long-folder", name: folderName }],
          }}
          onDeleted={() => {}}
        />,
      );
    });

    const link = container.querySelector<HTMLAnchorElement>("h3 a")!;
    const tag = container.querySelector('[aria-label="Tags"] [title]')!;
    const collection = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    expect(link.title).toBe(title);
    expect(link.textContent).toBe(`${title} (opens in a new tab)`);
    expect(tag.textContent).toBe(`#${tagName}`);
    expect(tag.getAttribute("title")).toBe(`#${tagName}`);
    expect(collection.title).toBe(folderName);
    expect(collection.textContent).toBe(folderName);

    await act(async () => collection.click());
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'))
      .find((button) => button.textContent === "New collection")!;
    await act(async () => option.click());
    expect(mocks.moveBookmark).toHaveBeenCalledWith({ bookmarkId: bookmark.id, folderId: "new-folder" });
  });

  it("uses Control for numbered shortcuts in Safari on macOS", () => {
    expect(
      getBookmarkShortcutModifier(
        "MacIntel",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
      ),
    ).toEqual({ label: "Control", display: "⌃" });
  });

  it("keeps Command for numbered shortcuts in Chrome on macOS", () => {
    expect(
      getBookmarkShortcutModifier(
        "MacIntel",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toEqual({ label: "Command", display: "⌘" });
  });

  it("does not open the bookmark when a card action is clicked", async () => {
    await act(async () => {
      root.render(
        <BookmarkCard
          bookmark={bookmark}
          onDeleted={() => {}}
          onMoved={() => {}}
        />,
      );
    });

    const bookmarkLink = container.querySelector<HTMLAnchorElement>(
      'a[href="https://example.com"]',
    )!;
    const linkClick = vi
      .spyOn(bookmarkLink, "click")
      .mockImplementation(() => {});
    const editButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit bookmark"]',
    )!;

    act(() => editButton.click());

    expect(linkClick).not.toHaveBeenCalled();
  });

  it("fetches the root-domain favicon from DuckDuckGo then falls back to text", async () => {
    await act(async () => {
      root.render(
        <BookmarkCard
          bookmark={{
            ...bookmark,
            url: "https://docs.test.google.com/some/path",
          }}
          onDeleted={() => {}}
        />,
      );
    });

    const favicon = container.querySelector<HTMLImageElement>(
      'img[src*="icons.duckduckgo.com/ip3/"]',
    );
    expect(favicon).not.toBeNull();
    expect(favicon!.src).toBe("https://icons.duckduckgo.com/ip3/google.com.ico");

    await act(async () => {
      favicon!.dispatchEvent(new Event("error"));
    });

    expect(
      container.querySelector('img[src*="icons.duckduckgo.com/ip3/"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="bookmark-favicon-fallback"]')
        ?.textContent,
    ).toBe("E");
  });

  it("changes collection when Safari moves focus during a tap", async () => {
    await act(async () => {
      root.render(
        <BookmarkCard
          bookmark={bookmark}
          onDeleted={() => {}}
          onMoved={() => {}}
        />,
      );
    });

    const collectionButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Current"))!;

    await act(async () => {
      collectionButton.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const newCollectionButton = Array.from(
      container.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ).find((button) => button.textContent?.includes("New collection"))!;
    const focusedItem = document.activeElement!;

    await act(async () => {
      newCollectionButton.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      focusedItem.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
      );
      document.body.dispatchEvent(
        new FocusEvent("focusin", { bubbles: true }),
      );
      newCollectionButton.click();
      newCollectionButton.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true }),
      );
    });

    expect(mocks.moveBookmark).toHaveBeenCalledWith({
      bookmarkId: "bookmark-1",
      folderId: "new-folder",
    });
    expect(container.textContent).toContain("New collection");
    expect(container.textContent).not.toContain("Current");
  });

  it("restores the previous collection when a move fails", async () => {
    mocks.moveBookmark.mockRejectedValueOnce(new Error("Move failed"));
    await act(async () => {
      root.render(
        <BookmarkCard
          bookmark={bookmark}
          onDeleted={() => {}}
          onMoved={() => {}}
        />,
      );
    });

    const collectionButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Current"))!;
    await act(async () => collectionButton.click());

    const newCollectionButton = Array.from(
      container.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ).find((button) => button.textContent?.includes("New collection"))!;
    await act(async () => newCollectionButton.click());

    expect(container.textContent).toContain("Current");
    expect(container.textContent).toContain("Move failed");
  });
});
