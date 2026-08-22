import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingDialog from "./OnboardingDialog";
import { ONBOARDING_STORAGE_KEY } from "../lib/onboarding";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("OnboardingDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("walks through the app features", async () => {
    await act(async () => {
      root.render(<OnboardingDialog open onClose={vi.fn()} />);
    });

    expect(document.body.textContent).toContain(
      "Your bookmarks, finally in order",
    );

    const next = () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Next",
      )!;

    await act(async () => next().click());
    expect(document.body.textContent).toContain(
      "Build a library that makes sense to you",
    );

    await act(async () => next().click());
    expect(document.body.textContent).toContain(
      "Jump straight to the link you want",
    );

    await act(async () => next().click());
    expect(document.body.textContent).toContain("Stay secure and in control");
    expect(document.body.textContent).toContain("Start bookmarking");
  });

  it("persists the choice to hide future tours", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<OnboardingDialog open onClose={onClose} />);
    });

    const hideCheckbox = document.querySelector('[role="checkbox"]')!;
    await act(async () => {
      (hideCheckbox as HTMLElement).click();
    });

    const skipButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Skip tour",
    )!;
    await act(async () => skipButton.click());

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides future tours after the user finishes onboarding", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<OnboardingDialog open onClose={onClose} />);
    });

    const next = () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Next",
      )!;

    await act(async () => next().click());
    await act(async () => next().click());
    await act(async () => next().click());

    const startButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === "Start bookmarking")!;
    await act(async () => startButton.click());

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("true");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not hide future tours unless the user chooses to", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<OnboardingDialog open onClose={onClose} />);
    });

    const closeButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Close onboarding",
    )!;
    await act(async () => closeButton.click());

    expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
