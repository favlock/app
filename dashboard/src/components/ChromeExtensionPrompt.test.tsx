import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChromeExtensionPrompt, {
  CHROME_EXTENSION_PROMPT_DISMISSED_KEY,
} from "./ChromeExtensionPrompt";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  checkStatus: vi.fn(),
  supportsExtension: vi.fn(),
}));

vi.mock("../lib/chromeExtension", () => ({
  checkChromeExtensionOnboardingStatus: mocks.checkStatus,
  supportsFavLockChromeExtension: mocks.supportsExtension,
}));

describe("ChromeExtensionPrompt", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (enabled = true) => {
    await act(async () => {
      root.render(
        <ChromeExtensionPrompt enabled={enabled} userId="account-a" />,
      );
    });
  };

  beforeEach(() => {
    localStorage.clear();
    mocks.checkStatus.mockReset().mockResolvedValue("not-installed");
    mocks.supportsExtension.mockReset().mockReturnValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("offers the extension on supported Chrome after startup dialogs", async () => {
    await render(false);
    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Chrome",
    );

    await render();

    expect(document.body.textContent).toContain(
      "Get more from FavLock in Chrome",
    );
    expect(document.body.textContent).toContain(
      "Save pages and articles, organize them as you go",
    );
    expect(
      document.querySelector<HTMLAnchorElement>(
        'a[href*="chromewebstore.google.com"]',
      )?.target,
    ).toBe("_blank");
  });

  it("stays hidden outside supported desktop Google Chrome", async () => {
    mocks.supportsExtension.mockReturnValue(false);
    await render();

    expect(mocks.checkStatus).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Chrome",
    );
  });

  it("stays hidden when the extension is already installed", async () => {
    mocks.checkStatus.mockResolvedValue("installed-unpaired");
    await render();

    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Chrome",
    );
  });

  it("persists dismissal only in local browser storage", async () => {
    await render();
    const dismissButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss Chrome extension suggestion"]',
    )!;

    await act(async () => dismissButton.click());

    expect(
      localStorage.getItem(CHROME_EXTENSION_PROMPT_DISMISSED_KEY),
    ).toBe("1");
    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Chrome",
    );

    act(() => root.unmount());
    root = createRoot(container);
    mocks.checkStatus.mockClear();
    await render();

    expect(mocks.checkStatus).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Chrome",
    );
  });
});
