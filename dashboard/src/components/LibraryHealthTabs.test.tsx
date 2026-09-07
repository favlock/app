import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LibraryHealthTabs from "./LibraryHealthTabs";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("LibraryHealthTabs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("links both health tools and marks the current section", async () => {
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/library-health/duplicates"]}>
        <LibraryHealthTabs activeTab="duplicates" />
      </MemoryRouter>,
    ));

    const duplicates = container.querySelector<HTMLAnchorElement>(
      'a[href="/library-health/duplicates"]',
    );
    const brokenLinks = container.querySelector<HTMLAnchorElement>(
      'a[href="/library-health/broken-links"]',
    );
    expect(duplicates?.getAttribute("aria-current")).toBe("page");
    expect(brokenLinks?.getAttribute("aria-current")).toBeNull();
  });
});
