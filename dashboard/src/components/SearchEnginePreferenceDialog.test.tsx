import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_ENGINES } from "../constants/searchEngines";
import { useBookmarkStore } from "../store/bookmarkStore";
import SearchEnginePreferenceDialog from "./SearchEnginePreferenceDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  useUserInfo: vi.fn(),
}));

vi.mock("../hooks/useUserInfoQuery", () => ({
  useUserInfo: mocks.useUserInfo,
  useUpdateSearchEngine: () => ({
    mutate: mocks.mutate,
    isPending: false,
  }),
}));

describe("SearchEnginePreferenceDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const google = SEARCH_ENGINES.find((engine) => engine.slug === "google")!;
    useBookmarkStore.setState({ selectedEngine: google });
    mocks.mutate.mockReset();
    mocks.useUserInfo.mockReset().mockReturnValue({
      data: { default_search_engine: null },
      isSuccess: true,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks for a favorite when the database has no default", async () => {
    await act(async () => {
      root.render(<SearchEnginePreferenceDialog />);
    });

    expect(document.body.textContent).toContain(
      "Choose your favorite search engine",
    );
    expect(
      Array.from(document.querySelectorAll("button")).filter(
        (button) => button.getAttribute("aria-pressed") === "true",
      ),
    ).toHaveLength(0);
    const initialSaveButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent === "Choose a search engine");
    expect(initialSaveButton?.disabled).toBe(true);

    const braveButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Brave",
    )!;
    await act(async () => {
      braveButton.click();
    });

    const saveButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Use Brave",
    )!;
    await act(async () => {
      saveButton.click();
    });

    expect(mocks.mutate).toHaveBeenCalledWith(
      "brave",
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    act(() => {
      mocks.mutate.mock.calls[0][1].onSuccess();
    });
    expect(useBookmarkStore.getState().selectedEngine.slug).toBe("brave");
  });

  it("uses the saved database preference without opening the chooser", async () => {
    const brave = SEARCH_ENGINES.find((engine) => engine.slug === "brave")!;
    useBookmarkStore.setState({ selectedEngine: brave });
    mocks.useUserInfo.mockReturnValue({
      data: { default_search_engine: "google" },
      isSuccess: true,
    });

    await act(async () => {
      root.render(<SearchEnginePreferenceDialog />);
    });

    expect(document.body.textContent).not.toContain(
      "Choose your favorite search engine",
    );
    expect(useBookmarkStore.getState().selectedEngine.slug).toBe("google");
  });

  it("waits until earlier startup dialogs are complete", async () => {
    await act(async () => {
      root.render(<SearchEnginePreferenceDialog enabled={false} />);
    });

    expect(document.body.textContent).not.toContain(
      "Choose your favorite search engine",
    );

    await act(async () => {
      root.render(<SearchEnginePreferenceDialog enabled />);
    });

    expect(document.body.textContent).toContain(
      "Choose your favorite search engine",
    );
  });
});
