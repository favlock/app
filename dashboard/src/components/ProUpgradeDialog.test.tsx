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
  });

  it("compares plans before continuing to checkout", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProUpgradeDialog open onClose={vi.fn()} />
        </MemoryRouter>,
      );
    });

    expect(document.body.textContent).toContain("Do more with FavLock Pro");
    expect(document.body.textContent).toContain("Full content");
    expect(document.body.textContent).toContain("10,000");
    expect(document.body.textContent).toContain("No ads");

    const upgradeLink = Array.from(document.querySelectorAll("a")).find(
      (link) => link.textContent?.includes("Upgrade to Pro"),
    );
    expect(upgradeLink?.getAttribute("href")).toBe("/checkout");
  });

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
