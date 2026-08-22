import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_ENGINES } from "../constants/searchEngines";
import { useBookmarkStore } from "../store/bookmarkStore";
import SearchCommandBar from "./SearchCommandBar";

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
});
