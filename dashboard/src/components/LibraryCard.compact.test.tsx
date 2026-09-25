import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LibraryCard from "./LibraryCard";
import { LibrarySelectionContext } from "../context/LibrarySelectionContext";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LibraryCard compact layout", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the row short and reveals existing actions without opening the item", async () => {
    const open = vi.fn();
    const edit = vi.fn();
    await act(async () => root.render(<LibraryCard kind="bookmark" layout="compact" title="Example" compactSummary="example.com"
      compactActionsLabel="Example" details={<p>Long preview</p>} category={<span>Work</span>}
      actions={<button onClick={edit}>Edit</button>} onClick={open} />));
    expect(container.textContent).toContain("Bookmark · example.com");
    expect(container.textContent).not.toContain("Long preview");
    expect(container.textContent).not.toContain("Edit");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Actions for Example"]')!.click());
    expect(container.textContent).toContain("Edit");
    expect(open).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Edit")!.click());
    expect(edit).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  it("selects the row and checkbox while hiding item actions in selection mode", async () => {
    const toggle = vi.fn();
    await act(async () => root.render(<LibrarySelectionContext.Provider value={{ checked: false, disabled: false, title: "Example", toggle }}>
      <LibraryCard kind="bookmark" layout="compact" title="Example" details={null} category={null} actions={null} onClick={vi.fn()} />
    </LibrarySelectionContext.Provider>));
    expect(container.querySelector('[aria-label="Actions for item"]')).toBeNull();
    await act(async () => container.querySelector("article")!.click());
    expect(toggle).toHaveBeenCalledOnce();
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(toggle).toHaveBeenCalledTimes(2);
  });
});
