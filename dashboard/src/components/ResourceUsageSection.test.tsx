import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResourceUsageSection from "./ResourceUsageSection";

const { useResourceUsage } = vi.hoisted(() => ({
  useResourceUsage: vi.fn(),
}));
const { useAccountPlan } = vi.hoisted(() => ({
  useAccountPlan: vi.fn(),
}));

vi.mock("../hooks/useResourceUsageQuery", () => ({
  useResourceUsage,
}));
vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan,
}));

describe("ResourceUsageSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useResourceUsage.mockReturnValue({
      data: {
        bookmarks: 250,
        entries: 5,
        readspace: 4,
        collections: 25,
        tags: 100,
        lists: 2,
      },
      isLoading: false,
      isError: false,
    });
    useAccountPlan.mockReturnValue({
      data: {
        id: "free",
        name: "Free",
        trashRecoveryDays: 7,
        limits: {
          bookmarks: 1000,
          entries: 10,
          readspace: 10,
          collections: 0,
          tags: 0,
          lists: 3,
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows usage against each account limit", async () => {
    await act(async () => {
      root.render(<ResourceUsageSection />);
    });

    const meters = [...container.querySelectorAll<HTMLElement>("[role=progressbar]")];
    expect(meters).toHaveLength(4);

    expect(meters[0].getAttribute("aria-label")).toBe("Bookmarks used");
    expect(meters[0].getAttribute("aria-valuenow")).toBe("250");
    expect(meters[0].getAttribute("aria-valuemax")).toBe("1000");
    expect((meters[0].firstElementChild as HTMLElement).style.width).toBe("25%");

    expect(meters[1].getAttribute("aria-label")).toBe(
      "Notes and tasks used",
    );
    expect(meters[1].getAttribute("aria-valuenow")).toBe("5");
    expect(meters[1].getAttribute("aria-valuemax")).toBe("10");
    expect((meters[1].firstElementChild as HTMLElement).style.width).toBe("50%");

    expect(meters[2].getAttribute("aria-label")).toBe(
      "Saved articles used",
    );
    expect(meters[2].getAttribute("aria-valuenow")).toBe("4");
    expect(meters[2].getAttribute("aria-valuemax")).toBe("10");
    expect((meters[2].firstElementChild as HTMLElement).style.width).toBe("40%");

    expect(meters[3].getAttribute("aria-label")).toBe("Lists used");
    expect(meters[3].getAttribute("aria-valuenow")).toBe("2");
    expect(meters[3].getAttribute("aria-valuemax")).toBe("3");

    expect(
      container.querySelector('[aria-label="Collections usage is unlimited"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Tags usage is unlimited"]'),
    ).not.toBeNull();
    expect(container.textContent?.match(/No limit/g)).toHaveLength(2);
    expect(container.textContent).toContain("Plan: Free");
  });

  it("uses the limits assigned to a Pro account", async () => {
    useAccountPlan.mockReturnValue({
      data: {
        id: "pro",
        name: "Pro",
        trashRecoveryDays: 30,
        limits: {
          bookmarks: 10000,
          entries: 1000,
          readspace: 250,
          collections: 0,
          tags: 0,
          lists: 0,
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    await act(async () => {
      root.render(<ResourceUsageSection />);
    });

    const meters = [...container.querySelectorAll<HTMLElement>("[role=progressbar]")];
    expect(meters[0].getAttribute("aria-valuemax")).toBe("10000");
    expect(meters[1].getAttribute("aria-valuemax")).toBe("1000");
    expect(meters[2].getAttribute("aria-valuemax")).toBe("250");
    expect(meters).toHaveLength(3);
    expect(container.textContent).toContain("Plan: Pro");
    expect(container.textContent).toContain("Trash recovery: 30 days");
  });

  it("shows reached and exceeded finite limits in red", async () => {
    useResourceUsage.mockReturnValue({
      data: {
        bookmarks: 1001,
        entries: 10,
        readspace: 11,
        collections: 2500,
        tags: 2500,
        lists: 4,
      },
      isLoading: false,
      isError: false,
    });

    await act(async () => {
      root.render(<ResourceUsageSection />);
    });

    const exceeded = container.querySelector<HTMLElement>(
      '[aria-label="Bookmarks limit exceeded"]',
    )!;
    const reached = container.querySelector<HTMLElement>(
      '[aria-label="Notes and tasks limit reached"]',
    )!;
    const readspaceExceeded = container.querySelector<HTMLElement>(
      '[aria-label="Saved articles limit exceeded"]',
    )!;
    const listsExceeded = container.querySelector<HTMLElement>(
      '[aria-label="Lists limit exceeded"]',
    )!;

    expect(exceeded.firstElementChild?.classList.contains("bg-red-500")).toBe(
      true,
    );
    expect(reached.firstElementChild?.classList.contains("bg-red-500")).toBe(
      true,
    );
    expect(
      readspaceExceeded.firstElementChild?.classList.contains("bg-red-500"),
    ).toBe(true);
    expect(listsExceeded.firstElementChild?.classList.contains("bg-red-500")).toBe(
      true,
    );
    expect(container.textContent).toContain("1 over limit");
    expect(container.textContent).toContain("Limit reached");
    expect(
      container.querySelector('[aria-label="Collections usage is unlimited"]'),
    ).not.toBeNull();
  });

  it("lets the user retry a failed usage request", async () => {
    const refetch = vi.fn();
    useResourceUsage.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });

    await act(async () => {
      root.render(<ResourceUsageSection />);
    });

    const retryButton = container.querySelector("button")!;
    await act(async () => retryButton.click());
    expect(refetch).toHaveBeenCalledOnce();
  });
});
