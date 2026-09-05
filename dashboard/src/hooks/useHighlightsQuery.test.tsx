import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type WebHighlight,
  useCreateArticleHighlight,
  useDeleteHighlights,
  useUpdateHighlightAnnotation,
  useUpdateHighlightColor,
} from "./useHighlightsQuery";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  encryptField: vi.fn(),
  createArticleHighlight: vi.fn(),
  updateHighlightAnnotation: vi.fn(),
  updateHighlightColor: vi.fn(),
  deleteHighlight: vi.fn(),
  retryBookmarkCacheSync: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    retryBookmarkCacheSync: mocks.retryBookmarkCacheSync,
    session: { access_token: "access-token" },
    user: { id: "user-1" },
  }),
}));

vi.mock("../context/useEncryption", () => ({
  useEncryption: () => ({ encryptField: mocks.encryptField }),
}));

vi.mock("../lib/highlightRepository", () => ({
  createArticleHighlight: mocks.createArticleHighlight,
  deleteHighlight: mocks.deleteHighlight,
  loadEncryptedHighlights: vi.fn(),
  updateHighlightAnnotation: mocks.updateHighlightAnnotation,
  updateHighlightColor: mocks.updateHighlightColor,
}));

const highlight: WebHighlight = {
  id: "highlight-1",
  bookmarkId: "bookmark-1",
  entryId: null,
  createdAt: "2026-09-03T10:00:00.000Z",
  updatedAt: "2026-09-03T10:00:00.000Z",
  payload: {
    version: 1,
    quote: { exact: "Selected text", prefix: "", suffix: "" },
    position: null,
    dom: null,
    color: "yellow",
    note: "Original annotation",
    capturedAt: "2026-09-03T10:00:00.000Z",
  },
};

function deferredPromise<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function MutationHarness({
  deleteTargets = [highlight, { ...highlight, id: "highlight-2" }],
}: {
  deleteTargets?: WebHighlight[];
}) {
  const annotation = useUpdateHighlightAnnotation();
  const color = useUpdateHighlightColor();
  const create = useCreateArticleHighlight();
  const deleteMany = useDeleteHighlights();
  return <>
    <button
      type="button"
      onClick={() => void annotation.mutateAsync({
        highlight,
        note: "  Updated annotation  ",
      }).catch(() => undefined)}
    >
      Update annotation
    </button>
    <button
      type="button"
      onClick={() => void color.mutateAsync({ highlight, color: "pink" }).catch(() => undefined)}
    >
      Update color
    </button>
    <button
      type="button"
      onClick={() => void create.mutateAsync({
        entryId: "article-1",
        optimisticId: "optimistic-highlight",
        payload: { ...highlight.payload, note: "", color: "green" },
      }).catch(() => undefined)}
    >
      Create article highlight
    </button>
    <button
      type="button"
      onClick={() => void deleteMany.mutateAsync(deleteTargets).catch(() => undefined)}
    >
      Delete highlights
    </button>
  </>;
}

describe("highlight optimistic mutations", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    mocks.encryptField.mockReset().mockResolvedValue("encrypted-annotation");
    mocks.createArticleHighlight.mockReset();
    mocks.updateHighlightAnnotation.mockReset();
    mocks.updateHighlightColor.mockReset();
    mocks.deleteHighlight.mockReset();
    mocks.retryBookmarkCacheSync.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["highlights", "user-1"], [highlight]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  const render = async (deleteTargets?: WebHighlight[]) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MutationHarness deleteTargets={deleteTargets} />
        </QueryClientProvider>,
      );
    });
  };

  const cachedHighlight = () =>
    queryClient.getQueryData<WebHighlight[]>(["highlights", "user-1"])?.[0];

  it("shows an annotation immediately and restores it when the write fails", async () => {
    const pending = deferredPromise();
    mocks.updateHighlightAnnotation.mockReturnValue(pending.promise);
    await render();

    await act(async () => {
      container.querySelectorAll("button")[0].click();
    });
    await vi.waitFor(() => expect(cachedHighlight()?.payload.note).toBe("Updated annotation"));
    expect(mocks.encryptField).toHaveBeenCalledWith("Updated annotation");

    pending.reject(new Error("Network unavailable"));
    await vi.waitFor(() => expect(cachedHighlight()?.payload.note).toBe("Original annotation"));
  });

  it("shows a color immediately and restores it when the write fails", async () => {
    const pending = deferredPromise();
    mocks.updateHighlightColor.mockReturnValue(pending.promise);
    await render();

    await act(async () => {
      container.querySelectorAll("button")[1].click();
    });
    await vi.waitFor(() => expect(cachedHighlight()?.payload.color).toBe("pink"));

    pending.reject(new Error("Network unavailable"));
    await vi.waitFor(() => expect(cachedHighlight()?.payload.color).toBe("yellow"));
  });

  it("shows a new article highlight immediately and removes it when creation fails", async () => {
    const pending = deferredPromise<string>();
    mocks.createArticleHighlight.mockReturnValue(pending.promise);
    await render();

    await act(async () => {
      container.querySelectorAll("button")[2].click();
    });
    await vi.waitFor(() => expect(
      queryClient.getQueryData<WebHighlight[]>(["highlights", "user-1"]),
    ).toContainEqual(expect.objectContaining({
      id: "optimistic-highlight",
      bookmarkId: null,
      entryId: "article-1",
    })));

    pending.reject(new Error("Network unavailable"));
    await vi.waitFor(() => expect(
      queryClient.getQueryData<WebHighlight[]>(["highlights", "user-1"]),
    ).toEqual([highlight]));
  });

  it("keeps successful deletions removed and restores only failed highlights", async () => {
    const secondHighlight = { ...highlight, id: "highlight-2" };
    queryClient.setQueryData(["highlights", "user-1"], [highlight, secondHighlight]);
    const firstPending = deferredPromise();
    const secondPending = deferredPromise();
    mocks.deleteHighlight
      .mockReturnValueOnce(firstPending.promise)
      .mockReturnValueOnce(secondPending.promise);
    await render();

    await act(async () => {
      container.querySelectorAll("button")[3].click();
    });
    await vi.waitFor(() => expect(
      queryClient.getQueryData<WebHighlight[]>(["highlights", "user-1"]),
    ).toEqual([]));

    firstPending.resolve();
    secondPending.reject(new Error("Network unavailable"));
    await vi.waitFor(() => expect(
      queryClient.getQueryData<WebHighlight[]>(["highlights", "user-1"]),
    ).toEqual([secondHighlight]));
    expect(mocks.retryBookmarkCacheSync).toHaveBeenCalledOnce();
  });

  it("limits bulk deletion to four concurrent requests", async () => {
    const targets = Array.from({ length: 6 }, (_, index) => ({
      ...highlight,
      id: `highlight-${index + 1}`,
    }));
    const pending = targets.map(() => deferredPromise());
    mocks.deleteHighlight.mockImplementation((_: string, highlightId: string) =>
      pending[targets.findIndex((target) => target.id === highlightId)].promise,
    );
    queryClient.setQueryData(["highlights", "user-1"], targets);
    await render(targets);

    await act(async () => {
      container.querySelectorAll("button")[3].click();
    });
    await vi.waitFor(() => expect(mocks.deleteHighlight).toHaveBeenCalledTimes(4));

    pending.slice(0, 4).forEach(({ resolve }) => resolve());
    await vi.waitFor(() => expect(mocks.deleteHighlight).toHaveBeenCalledTimes(6));
    pending.slice(4).forEach(({ resolve }) => resolve());
    await vi.waitFor(() => expect(mocks.retryBookmarkCacheSync).toHaveBeenCalledOnce());
  });
});
