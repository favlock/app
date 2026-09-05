import { act, createElement, createRef, useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  highlights: [{
    id: "highlight-1",
    bookmarkId: null,
    entryId: "article-1",
    payload: {
      version: 1,
      quote: { exact: "highlighted passage", prefix: "A", suffix: "returns" },
      position: { start: 2, end: 21 },
      dom: null,
      color: "yellow",
      note: "",
      capturedAt: "2026-09-04T00:00:00.000Z",
    },
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  }],
  mutateAsync: vi.fn(),
}));

vi.mock("../hooks/useHighlightsQuery", () => ({
  useHighlights: () => ({ data: mocks.highlights }),
  useCreateArticleHighlight: () => ({ mutateAsync: mocks.mutateAsync }),
  useDeleteHighlight: () => ({ isPending: false, mutateAsync: mocks.mutateAsync }),
  useUpdateHighlightAnnotation: () => ({ isPending: false, mutateAsync: mocks.mutateAsync }),
  useUpdateHighlightColor: () => ({ isPending: false, mutateAsync: mocks.mutateAsync }),
}));

vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({ data: { id: "free" } }),
}));

vi.mock("./ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(open), [open]);
    return mounted ? createElement("div", null, children) : null;
  },
  DialogActions: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DialogDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("./ProUpgradeDialog", () => ({ default: () => null }));

import ReadspaceArticleDialog, { ArticleBody } from "./ReadspaceArticleDialog";

describe("ReadspaceArticleDialog article body", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it("preserves the live browser selection when the dialog state re-renders", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const articleRef = createRef<HTMLElement>();
    const onSelection = vi.fn();
    const html = "<p>Keep this text selected.</p>";

    flushSync(() => {
      root.render(
        <ArticleBody articleRef={articleRef} html={html} onSelection={onSelection} />,
      );
    });
    const articleNode = articleRef.current!;
    const textNode = articleNode.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 5);
    range.setEnd(textNode, 14);
    const selection = window.getSelection()!;
    selection.addRange(range);

    flushSync(() => {
      root.render(
        <ArticleBody articleRef={articleRef} html={html} onSelection={onSelection} />,
      );
    });

    expect(articleRef.current).toBe(articleNode);
    expect(selection.toString()).toBe("this text");
    root.unmount();
  });

  it("restores highlights after the dialog mounts its article content", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ReadspaceArticleDialog
          article={{
            entry: {
              id: "article-1",
              title: "Saved article",
              folder: null,
              tags: [],
            },
            content: {
              html: "<p>A highlighted passage returns when opened.</p>",
              sourceUrl: "https://example.com/article",
            },
          } as never}
          onClose={vi.fn()}
        />,
      );
    });

    expect(container.querySelector("mark")?.textContent).toBe("highlighted passage");
    expect(
      (container.querySelector('[aria-label="Add annotation"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () => root.unmount());
  });
});
