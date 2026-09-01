import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOnboardingState } from "../lib/onboarding";
import { useAddBookmark } from "./useBookmarksQuery";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createBookmark: vi.fn(),
  retryBookmarkCacheSync: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "access-token" },
    user: { id: "account-a" },
    retryBookmarkCacheSync: mocks.retryBookmarkCacheSync,
  }),
}));

vi.mock("../lib/bookmarkRepository", () => ({
  createBookmark: mocks.createBookmark,
  moveBookmarkToFolder: vi.fn(),
  setBookmarkFavorite: vi.fn(),
  trashBookmark: vi.fn(),
  updateBookmark: vi.fn(),
}));

function SaveHarness() {
  const addBookmark = useAddBookmark();
  return (
    <button
      type="button"
      onClick={() =>
        addBookmark.mutate({
          title: "encrypted-title",
          url: "encrypted-url",
          folderId: null,
          existingTagIds: [],
          newEncryptedTagNames: [],
        })
      }
    >
      Save
    </button>
  );
}

describe("useAddBookmark onboarding boundary", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    localStorage.clear();
    mocks.createBookmark.mockReset();
    mocks.retryBookmarkCacheSync.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  const render = async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SaveHarness />
        </QueryClientProvider>,
      );
    });
  };

  it("marks the library populated only after the authoritative save succeeds", async () => {
    mocks.createBookmark.mockResolvedValue("bookmark-1");
    await render();

    await act(async () => container.querySelector("button")!.click());

    await vi.waitFor(() =>
      expect(readOnboardingState("account-a").libraryPopulated).toBe(
        "populated",
      ),
    );
    expect(mocks.retryBookmarkCacheSync).toHaveBeenCalledOnce();
  });

  it("does not advance onboarding when the save is rejected", async () => {
    mocks.createBookmark.mockRejectedValue(new Error("Quota exceeded"));
    await render();

    await act(async () => {
      container.querySelector("button")!.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(mocks.createBookmark).toHaveBeenCalledOnce());
    expect(readOnboardingState("account-a").libraryPopulated).toBe("unknown");
  });
});
