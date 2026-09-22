import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBookmarkSorting } from "./useBookmarkSorting";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function Harness({ userId }: { userId: string }) {
  const [value, update] = useBookmarkSorting(userId);
  return <button onClick={() => update({ order: "name-asc", favoritesFirst: true, bookmarksOnly: true })}>{JSON.stringify(value)}</button>;
}
describe("device sorting preferences", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); vi.restoreAllMocks(); });
  it("persists after remount and isolates cloud and local accounts", () => {
    act(() => root.render(<Harness userId="cloud-user" />));
    act(() => container.querySelector("button")!.click());
    expect(localStorage.getItem("favlock.bookmark-sorting.v1:cloud-user")).toContain("name-asc");
    act(() => root.render(<Harness userId="local-vault" />));
    expect(container.textContent).toContain('"order":"default"');
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<Harness userId="cloud-user" />));
    expect(container.textContent).toContain('"order":"name-asc"');
    expect(container.textContent).toContain('"favoritesFirst":true');
  });
  it("uses safe defaults for corrupt or outdated preferences", () => {
    localStorage.setItem("favlock.bookmark-sorting.v1:test", '{"order":["name-asc"],"favoritesFirst":"yes"}');
    act(() => root.render(<Harness userId="test" />));
    expect(container.textContent).toContain('"order":"default"');
    expect(container.textContent).toContain('"favoritesFirst":false');
  });
  it("allows sorting when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    act(() => root.render(<Harness userId="test" />));
    act(() => container.querySelector("button")!.click());
    expect(container.textContent).toContain('"order":"name-asc"');
  });
});
