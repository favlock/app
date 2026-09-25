import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLibraryLayout } from "./useLibraryLayout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useLibraryLayout", () => {
  let root: Root;
  let container: HTMLDivElement;
  let narrow = true;
  let onChange: (() => void) | undefined;
  let current: ReturnType<typeof useLibraryLayout>;

  function Fixture({ userId, wideDefault }: { userId: string; wideDefault?: "cards" | "compact" }) {
    current = useLibraryLayout(userId, wideDefault);
    return <button onClick={() => current.update("cards")}>{current.layout}</button>;
  }

  beforeEach(() => {
    localStorage.clear();
    narrow = true;
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      get matches() { return narrow; },
      addEventListener: (_event: string, listener: () => void) => { onChange = listener; },
      removeEventListener: () => { onChange = undefined; },
    })));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("defaults to compact on narrow screens and remembers independent account and viewport choices", async () => {
    await act(async () => root.render(<Fixture userId="alice" />));
    expect(container.textContent).toBe("compact");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe("cards");
    expect(localStorage.getItem("favlock.library-layout.v1:alice:narrow")).toBe("cards");

    narrow = false;
    await act(async () => onChange?.());
    expect(container.textContent).toBe("cards");
    await act(async () => current.update("compact"));
    expect(container.textContent).toBe("compact");

    await act(async () => root.render(<Fixture userId="bob" />));
    expect(container.textContent).toBe("cards");
    narrow = true;
    await act(async () => onChange?.());
    expect(container.textContent).toBe("compact");
    await act(async () => root.render(<Fixture userId="alice" />));
    expect(container.textContent).toBe("cards");
  });

  it("keeps the existing wide task list as its default until a user chooses a layout", async () => {
    narrow = false;
    await act(async () => root.render(<Fixture userId="task-account" wideDefault="compact" />));
    expect(container.textContent).toBe("compact");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe("cards");
  });
});
