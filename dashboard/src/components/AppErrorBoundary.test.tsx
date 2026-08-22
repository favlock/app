import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("AppErrorBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    consoleError.mockRestore();
  });

  it("shows a recovery screen and can render the app again", async () => {
    let shouldThrow = true;

    function UnstableScreen() {
      if (shouldThrow) throw new Error("render failed");
      return <p>Recovered</p>;
    }

    await act(async () => {
      root.render(
        <AppErrorBoundary>
          <UnstableScreen />
        </AppErrorBoundary>,
      );
    });

    expect(container.textContent).toContain("Something went wrong");

    shouldThrow = false;
    const retryButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Try again"),
    )!;
    await act(async () => retryButton.click());

    expect(container.textContent).toContain("Recovered");
  });
});
