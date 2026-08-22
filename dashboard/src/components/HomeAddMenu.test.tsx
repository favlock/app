import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomeAddMenu from "./HomeAddMenu";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe("HomeAddMenu", () => {
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

  it.each([
    ["Bookmark", "bookmark"],
    ["Note", "note"],
    ["Task", "todo"],
  ])("lets the user choose %s from one add button", async (label, type) => {
    const callbacks = {
      bookmark: vi.fn(),
      note: vi.fn(),
      todo: vi.fn(),
    };

    await act(async () => {
      root.render(
        <HomeAddMenu
          onAddBookmark={callbacks.bookmark}
          onAddNote={callbacks.note}
          onAddTodo={callbacks.todo}
        />,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add new"]')!
        .click();
    });

    const option = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes(label));
    expect(option).toBeDefined();

    await act(async () => option!.click());

    expect(callbacks[type as keyof typeof callbacks]).toHaveBeenCalledOnce();
  });
});
