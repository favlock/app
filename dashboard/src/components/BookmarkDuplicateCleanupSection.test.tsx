import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookmarkDuplicateGroup } from "../lib/bookmarkDuplicates";
import BookmarkDuplicateCleanupSection from "./BookmarkDuplicateCleanupSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  applyCleanup: vi.fn(),
  loadStoredGroups: vi.fn(),
  retryBookmarkCacheSync: vi.fn(),
}));

const groups: BookmarkDuplicateGroup[] = [
  {
    normalizedUrl: "https://example.com/article",
    keeper: {
      id: "article-old",
      title: "Design systems",
      url: "https://example.com/article",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    duplicates: [
      {
        id: "article-new",
        title: "Design systems newsletter",
        url: "https://example.com/article?utm_source=newsletter",
        created_at: "2026-02-01T00:00:00.000Z",
      },
    ],
    matchNote: "Matched after ignoring tracking parameters (utm_source).",
  },
  {
    normalizedUrl: "https://docs.example.org/guide",
    keeper: {
      id: "docs-old",
      title: "API guide",
      url: "https://docs.example.org/guide",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    duplicates: [
      {
        id: "docs-new",
        title: "API guide setup",
        url: "https://docs.example.org/guide#setup",
        created_at: "2026-02-01T00:00:00.000Z",
      },
    ],
    matchNote: "Matched after ignoring page sections.",
  },
];

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    retryBookmarkCacheSync: mocks.retryBookmarkCacheSync,
    session: { access_token: "access-token" },
  }),
}));

vi.mock("../context/useDuplicateScan", () => ({
  useDuplicateScan: () => ({
    applyCleanup: mocks.applyCleanup,
    deviceState: {
      duplicateCount: 2,
      lastScanAt: "2026-09-06T09:00:00.000Z",
      scannedCount: 4,
      totalCount: 4,
    },
    error: null,
    groups,
    loadStoredGroups: mocks.loadStoredGroups,
    phase: "complete",
  }),
}));

vi.mock("../lib/bookmarkRepository", () => ({
  cleanupDuplicateBookmarks: vi.fn(),
}));

describe("BookmarkDuplicateCleanupSection", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
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
    vi.clearAllMocks();
  });

  async function render() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <BookmarkDuplicateCleanupSection />
        </QueryClientProvider>,
      );
    });
  }

  it("renders the compact duplicate grid without a search control", async () => {
    await render();

    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.textContent).toContain("2 groups · 2 selected");
    expect(container.textContent).toContain("API guide");
    expect(container.textContent).toContain("Design systems");
    expect(
      container.querySelector('[aria-label="Search duplicate bookmarks"]'),
    ).toBeNull();
  });
});
