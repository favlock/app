import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FirefoxExtensionPrompt, {
  FIREFOX_EXTENSION_PROMPT_DISMISSED_KEY,
} from "./FirefoxExtensionPrompt";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  checkStatus: vi.fn(),
  supportsExtension: vi.fn(),
}));

vi.mock("../lib/firefoxExtension", () => ({
  checkFirefoxExtensionInstallation: mocks.checkStatus,
  supportsFavLockFirefoxExtension: mocks.supportsExtension,
}));

describe("FirefoxExtensionPrompt", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (enabled = true) => {
    await act(async () => {
      root.render(
        <FirefoxExtensionPrompt enabled={enabled} userId="account-a" />,
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

  it("offers the extension on supported Firefox after startup dialogs", async () => {
    await render(false);
    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Firefox",
    );

    await render();

    expect(document.body.textContent).toContain(
      "Get more from FavLock in Firefox",
    );
    expect(document.body.textContent).toContain(
      "Save pages and articles, organize them as you go",
    );
    expect(
      document.querySelector<HTMLAnchorElement>(
        'a[href*="addons.mozilla.org"]',
      )?.target,
    ).toBe("_blank");
  });

  it("stays hidden outside supported desktop Firefox", async () => {
    mocks.supportsExtension.mockReturnValue(false);
    await render();

    expect(mocks.checkStatus).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Firefox",
    );
  });

  it("stays hidden when the extension is already installed", async () => {
    mocks.checkStatus.mockResolvedValue("installed");
    await render();

    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Firefox",
    );
  });

  it("persists dismissal only in local browser storage", async () => {
    await render();
    const dismissButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss Firefox extension suggestion"]',
    )!;

    await act(async () => dismissButton.click());

    expect(
      localStorage.getItem(FIREFOX_EXTENSION_PROMPT_DISMISSED_KEY),
    ).toBe("1");
    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Firefox",
    );

    act(() => root.unmount());
    root = createRoot(container);
    mocks.checkStatus.mockClear();
    await render();

    expect(mocks.checkStatus).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Firefox",
    );
  });

  it("renders the dismissible Readspace variant only when Firefox is missing", async () => {
    await act(async () => {
      root.render(
        <FirefoxExtensionPrompt
          enabled
          userId="account-a"
          variant="inline"
        />,
      );
    });

    expect(document.body.textContent).toContain(
      "Install FavLock for Firefox to save articles directly to Readspace.",
    );

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Dismiss Firefox extension suggestion"]',
        )!
        .click();
    });

    expect(
      localStorage.getItem(FIREFOX_EXTENSION_PROMPT_DISMISSED_KEY),
    ).toBe("1");
    expect(document.body.textContent).not.toContain(
      "Install FavLock for Firefox",
    );
  });

  it("synchronizes dismissal between mounted prompt variants", async () => {
    await act(async () => {
      root.render(
        <>
          <FirefoxExtensionPrompt enabled userId="account-a" />
          <FirefoxExtensionPrompt
            enabled
            userId="account-a"
            variant="inline"
          />
        </>,
      );
    });

    expect(
      document.querySelectorAll(
        'button[aria-label="Dismiss Firefox extension suggestion"]',
      ),
    ).toHaveLength(2);

    await act(async () => {
      document
        .querySelectorAll<HTMLButtonElement>(
          'button[aria-label="Dismiss Firefox extension suggestion"]',
        )[1]
        .click();
    });

    expect(document.body.textContent).not.toContain(
      "Get more from FavLock in Firefox",
    );
    expect(document.body.textContent).not.toContain(
      "Install FavLock for Firefox",
    );
  });
});
