import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProUpgradeDialog from "./ProUpgradeDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("ProUpgradeDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.unstubAllEnvs();
  });

  it("compares Free and Pro benefits before continuing to checkout", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProUpgradeDialog open onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });

    expect(document.body.textContent).toContain(
      "Save more. Find more. Recover longer.",
    );
    expect(document.body.textContent).toContain(
      "FavLock Pro gives you unlimited bookmarks and highlights, encrypted annotations, deeper search, and more space for everything you save",
    );
    const comparison = document.querySelector("table")!;
    expect(comparison.textContent).toContain("Free");
    expect(comparison.textContent).toContain("Pro");
    expect(comparison.textContent).toContain("Bookmarks");
    expect(comparison.textContent).toContain("Up to 1,000");
    expect(comparison.textContent).toContain("Unlimited");
    expect(comparison.textContent).toContain("1,000");
    expect(comparison.textContent).toContain("250");
    expect(comparison.textContent).toContain("Web highlights");
    expect(comparison.textContent).toContain("100");
    expect(comparison.textContent).toContain("Unlimited · annotations");
    expect(comparison.textContent).not.toContain("four colors");
    expect(comparison.textContent).toContain("Readspace articles");
    expect(comparison.textContent).toContain("30 days");
    expect(comparison.textContent).toContain("Support");
    expect(comparison.textContent).toContain("Standard");
    expect(comparison.textContent).toContain("Priority");
    expect(comparison.textContent).toContain("Duplicate monitor");
    expect(comparison.textContent).toContain("Broken link monitor");
    expect(comparison.textContent).toContain("Saved Smart Views");
    expect(comparison.textContent).toContain("Sorting across devices");
    expect(comparison.textContent).toContain("Cloud sync");
    expect(document.body.textContent).toContain(
      "Both plans search bookmark titles, URLs, tags, collections, and highlighted text in Readspace",
    );
    expect(document.body.textContent).toContain(
      "Everything in Free stays included",
    );
    expect(document.body.textContent).toContain(
      "Browser-side encryption for protected content",
    );
    expect(document.body.textContent).toContain("Unlimited collections and tags");
    expect(document.body.textContent).toContain("No ads");
    expect(document.body.textContent).toContain(
      "Markdown, HTML, and JSON highlight exports",
    );

    const upgradeLink = Array.from(document.querySelectorAll("a")).find(
      (link) => link.textContent?.includes("Upgrade to Pro"),
    );
    expect(upgradeLink?.getAttribute("href")).toBe("/checkout");
  });

  it("shows the configured yearly price when it is valid", async () => {
    vi.stubEnv("VITE_PRO_YEARLY_PRICE_USD", "19.50");
    await act(async () => {
      root.render(<MemoryRouter><ProUpgradeDialog open onClose={vi.fn()} /></MemoryRouter>);
    });

    expect(document.body.textContent).toContain("$19.50 / year · billed yearly");
  });

  it.each(["", "0", "not-a-price"])(
    "hides an unavailable yearly price (%s)",
    async (price) => {
      vi.stubEnv("VITE_PRO_YEARLY_PRICE_USD", price);
      await act(async () => {
        root.render(<MemoryRouter><ProUpgradeDialog open onClose={vi.fn()} /></MemoryRouter>);
      });

      expect(document.body.textContent).not.toContain("billed yearly");
    },
  );

  it("can be dismissed without starting checkout", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProUpgradeDialog open onClose={onClose} />
        </MemoryRouter>,
      );
    });

    const dismissButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Not now",
    )!;
    await act(async () => dismissButton.click());

    expect(onClose).toHaveBeenCalledOnce();
  });
});
