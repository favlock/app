import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_ENGINES } from "../constants/searchEngines";
import { useBookmarkStore } from "../store/bookmarkStore";
import SearchCommandBar from "./SearchCommandBar";
import { DEFAULT_LIBRARY_SEARCH_FILTERS } from "../lib/librarySearchFilters";

describe("SearchCommandBar", () => {
  let container: HTMLDivElement;
  let root: Root;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const google = SEARCH_ENGINES.find((engine) => engine.slug === "google")!;
    useBookmarkStore.setState({ searchQuery: "", selectedEngine: google });

    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    openSpy.mockRestore();
  });

  it("keeps a typed address local until web search is explicit", async () => {
    await act(async () => root.render(<SearchCommandBar />));

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search your library"]',
    )!;

    act(() => {
      useBookmarkStore.getState().setSearchQuery("example.com");
    });
    act(() => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(openSpy).not.toHaveBeenCalled();
    expect(input.value).toBe("example.com");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Search the web with Google"]',
        )!
        .click();
    });

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("keeps library filtering separate from the explicit web action", async () => {
    await act(async () =>
      root.render(
        <SearchCommandBar bookmarkSearchStatus="2 results for “moon”" />,
      ),
    );

    act(() => {
      useBookmarkStore.getState().setSearchQuery("moon");
    });

    expect(container.textContent).toContain("2 results for “moon”");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Search your library"]',
      )!.value,
    ).toBe("moon");

    act(() => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(openSpy).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Search the web with Google"]',
        )!
        .click();
    });

    expect(openSpy).toHaveBeenCalledWith(
      "https://www.google.com/search?q=moon",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("uses a newly selected search engine without waiting for the dashboard", async () => {
    const onEngineChange = vi.fn();
    await act(async () =>
      root.render(<SearchCommandBar onEngineChange={onEngineChange} />),
    );

    const select = container.querySelector("select")!;
    const input = container.querySelector<HTMLInputElement>("input")!;

    await act(async () => {
      select.value = "brave";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.activeElement).toBe(input);
    act(() => {
      useBookmarkStore.getState().setSearchQuery("moon lock");
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Search the web with Brave"]',
        )!
        .click();
    });

    expect(onEngineChange).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "brave" }),
    );
    expect(openSpy).toHaveBeenCalledWith(
      "https://search.brave.com/search?q=moon%20lock",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("saves an explicit web search and clears the input", async () => {
    const onSearchSubmitted = vi.fn();
    await act(async () =>
      root.render(
        <SearchCommandBar onSearchSubmitted={onSearchSubmitted} />,
      ),
    );

    act(() => {
      useBookmarkStore.getState().setSearchQuery("encrypted search");
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Search the web with Google"]',
        )!
        .click();
    });

    expect(onSearchSubmitted).toHaveBeenCalledWith("encrypted search");
    expect(useBookmarkStore.getState().searchQuery).toBe("");
    expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("");
  });

  it("shows matching recent searches and applies a clicked suggestion locally", async () => {
    const onSearchSubmitted = vi.fn();
    await act(async () =>
      root.render(
        <SearchCommandBar
          searchHistory={["moon privacy", "bookmark import", "moon notes"]}
          onSearchSubmitted={onSearchSubmitted}
        />,
      ),
    );

    const input = container.querySelector<HTMLInputElement>("input")!;
    const setInputValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;

    await act(async () => {
      input.focus();
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();

    await act(async () => {
      setInputValue.call(input, "mo");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();

    await act(async () => {
      setInputValue.call(input, "moo");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const options = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "moon privacy",
      "moon notes",
    ]);

    act(() => options[0].click());
    expect(onSearchSubmitted).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(useBookmarkStore.getState().searchQuery).toBe("moon privacy");
  });

  it("offers Free field and metadata filters without submitting a web search", async () => {
    const onFiltersChange = vi.fn();
    await act(async () => root.render(
      <SearchCommandBar filters={DEFAULT_LIBRARY_SEARCH_FILTERS} onFiltersChange={onFiltersChange}
        tags={[{ id: "tag-1", user_id: "user-1", name: "Research", created_at: "2026-01-01" }]} />,
    ));

    const filterToggle = container.querySelector<HTMLButtonElement>('button[aria-controls="library-search-filter-panel"]')!;
    const filterPanel = container.querySelector<HTMLDivElement>("#library-search-filter-panel")!;
    expect(filterToggle.getAttribute("aria-expanded")).toBe("false");
    expect(filterPanel.hidden).toBe(true);
    act(() => filterToggle.click());
    expect(filterToggle.getAttribute("aria-expanded")).toBe("true");
    expect(filterPanel.hidden).toBe(false);

    const field = container.querySelector<HTMLSelectElement>('select[aria-label="Search by"]')!;
    const tag = container.querySelector<HTMLSelectElement>('select[aria-label="Filter by tag"]')!;
    await act(async () => {
      field.value = "title";
      field.dispatchEvent(new Event("change", { bubbles: true }));
      tag.value = "tag-1";
      tag.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ field: "title" }));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ tagId: "tag-1" }));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("summarizes active filters while the filter panel is closed", async () => {
    await act(async () => root.render(
      <SearchCommandBar
        filters={{ ...DEFAULT_LIBRARY_SEARCH_FILTERS, itemType: "bookmark", tagId: "tag-1" }}
        onFiltersChange={vi.fn()}
        tags={[{ id: "tag-1", user_id: "user-1", name: "Research", created_at: "2026-01-01" }]}
      />,
    ));

    const filterToggle = container.querySelector<HTMLButtonElement>('button[aria-controls="library-search-filter-panel"]')!;
    expect(filterToggle.textContent).toContain("2");
    expect(container.textContent).toContain("Bookmarks · Tag: Research");
    expect(container.querySelector<HTMLDivElement>("#library-search-filter-panel")!.hidden).toBe(true);
  });

  it("shows a disabled Pro save action on Free and enables it for an active Pro search", async () => {
    const onSaveSmartView = vi.fn();
    await act(async () => root.render(<SearchCommandBar filters={DEFAULT_LIBRARY_SEARCH_FILTERS}
      onFiltersChange={vi.fn()} onSaveSmartView={onSaveSmartView} canSaveSmartView={false} />));
    expect(container.querySelector('button[aria-label="Save Smart View, available on Pro"]')).toBeNull();
    const filterToggle = container.querySelector<HTMLButtonElement>('button[aria-controls="library-search-filter-panel"]')!;
    act(() => filterToggle.click());
    const freeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Save Smart View, available on Pro"]')!;
    expect(freeButton.disabled).toBe(true);
    expect(container.textContent).toContain("Available on Pro");

    await act(async () => root.render(<SearchCommandBar filters={DEFAULT_LIBRARY_SEARCH_FILTERS}
      onFiltersChange={vi.fn()} onSaveSmartView={onSaveSmartView} canSaveSmartView />));
    const proButton = container.querySelector<HTMLButtonElement>('button[aria-label="Save Smart View"]')!;
    expect(proButton.disabled).toBe(true);
    act(() => useBookmarkStore.getState().setSearchQuery("design"));
    expect(proButton.disabled).toBe(false);
    act(() => proButton.click());
    expect(onSaveSmartView).toHaveBeenCalledOnce();
    act(() => filterToggle.click());
    expect(container.querySelector('button[aria-label="Save Smart View"]')).toBeNull();
  });
});
