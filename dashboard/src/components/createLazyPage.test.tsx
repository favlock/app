import { act, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";
import { createLazyPage } from "./createLazyPage";
import { PAGE_LOAD_RETRY_DELAY_MS } from "../lib/pageLoad";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("recoverable lazy pages", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function render(children: ReactNode) {
    await act(async () => root.render(children));
  }

  async function finishRetry() {
    await act(async () => vi.advanceTimersByTimeAsync(PAGE_LOAD_RETRY_DELAY_MS));
  }

  function button(label: string) {
    return [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label))!;
  }

  it("recovers a transient download without unmounting surrounding state", async () => {
    const unmount = vi.fn();
    function Shell({ children }: { children: ReactNode }) {
      const [count, setCount] = useState(0);
      useEffect(() => unmount, []);
      return <><button onClick={() => setCount(count + 1)}>State {count}</button>{children}</>;
    }
    const load = vi.fn()
      .mockRejectedValueOnce(new TypeError("Importing a module script failed."))
      .mockResolvedValue({ default: () => <h1>Notes</h1> });
    const Page = createLazyPage(load);
    await render(<Shell><Page /></Shell>);
    await act(async () => button("State").click());
    expect(container.textContent).toContain("Loading");
    await finishRetry();
    expect(container.textContent).toContain("Notes");
    expect(container.textContent).toContain("State 1");
    expect(unmount).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("resets the rejected lazy import on Try again and retains the recovered page on revisit", async () => {
    const load = vi.fn().mockRejectedValue(new TypeError("Importing a module script failed."));
    const Page = createLazyPage(load);
    await render(
      <MemoryRouter initialEntries={["/notes?q=test#saved"]}>
        <nav><Link to="/notes?q=test#saved">Open notes</Link><Link to="/tasks">Open tasks</Link></nav>
        <Routes>
          <Route path="/notes" element={<Page />} />
          <Route path="/tasks" element={<h1>Tasks</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    await finishRetry();
    expect(container.textContent).toContain("This page couldn’t load");
    expect(container.querySelector("nav")).not.toBeNull();
    expect(container.textContent).not.toContain("Something went wrong");
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/tasks"]')!.click());
    expect(container.textContent).toContain("Tasks");
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/notes?q=test#saved"]')!.click());
    expect(container.textContent).toContain("This page couldn’t load");
    load.mockResolvedValue({ default: () => <h1>Recovered notes</h1> });
    await act(async () => button("Try again").click());
    expect(container.textContent).toContain("Recovered notes");
    expect(load).toHaveBeenCalledTimes(3);
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/tasks"]')!.click());
    expect(container.textContent).toContain("Tasks");
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/notes?q=test#saved"]')!.click());
    expect(container.textContent).toContain("Recovered notes");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("shows an offline state and enables a real retry after reconnecting", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const load = vi.fn().mockRejectedValue(new TypeError("Importing a module script failed."));
    const Page = createLazyPage(load);
    await render(<Page />);
    expect(container.textContent).toContain("You’re offline");
    expect(button("Try again").disabled).toBe(true);
    expect(button("Reload app").disabled).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    online.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(button("Try again").disabled).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    load.mockResolvedValue({ default: () => <h1>Notes</h1> });
    await act(async () => button("Try again").click());
    expect(container.textContent).toContain("Notes");
  });

  it("stops retrying persistent failures and offers an explicit reload", async () => {
    const load = vi.fn().mockRejectedValue(new TypeError("Failed to fetch dynamically imported module: /assets/Notes-old.js"));
    const Page = createLazyPage(load);
    await render(<Page />);
    await finishRetry();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(load).toHaveBeenCalledTimes(2);
    expect(button("Reload app").disabled).toBe(false);
    expect(container.textContent).toContain("unsaved edits");
    expect(container.textContent).not.toContain("Notes-old.js");
  });

  it("still sends component bugs to the app error boundary", async () => {
    const load = vi.fn().mockResolvedValue({ default: () => { throw new Error("render failed"); } });
    const Page = createLazyPage(load);
    await render(<AppErrorBoundary><Page /></AppErrorBoundary>);
    expect(container.textContent).toContain("Something went wrong");
    expect(container.textContent).not.toContain("This page couldn’t load");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
