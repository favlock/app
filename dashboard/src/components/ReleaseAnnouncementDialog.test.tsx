import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ReleaseAnnouncementDialog from "./ReleaseAnnouncementDialog";
import {
  getAnnounceableReleaseSeries,
  RELEASE_ANNOUNCEMENT_SEEN_KEY,
} from "../lib/releaseAnnouncement";
import type { Release } from "../data/changelog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const minorRelease = {
  version: "1.9.0",
  date: "September 5, 2026",
  changes: ["Save highlights from Chrome.", "Sign in with Apple."],
  announcementHighlights: [
    "Save highlights with the Chrome extension and revisit them in Readspace.",
    "Sign in with Apple, Google, or email.",
    "Safer library imports and a smoother Readspace experience.",
  ],
} satisfies Release;

describe("ReleaseAnnouncementDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (
    release: Release = minorRelease,
    enabled = true,
  ) => {
    await act(async () => {
      root.render(
        <ReleaseAnnouncementDialog enabled={enabled} release={release} />,
      );
    });
  };

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

  it("recognizes major and minor releases but excludes patches", () => {
    expect(getAnnounceableReleaseSeries("1.9.0")).toBe("1.9");
    expect(getAnnounceableReleaseSeries("2.0.0")).toBe("2.0");
    expect(getAnnounceableReleaseSeries("1.9.1")).toBeNull();
    expect(getAnnounceableReleaseSeries("invalid")).toBeNull();
  });

  it("shows the current minor release once it is enabled", async () => {
    await render(minorRelease, false);
    expect(document.body.textContent).not.toContain("What’s new in FavLock");

    await render();
    expect(document.body.textContent).toContain("What’s new in FavLock");
    expect(document.body.textContent).toContain(
      "FavLock has been updated with new features and improvements across the app.",
    );
    expect(document.body.textContent).not.toContain(
      "Save highlights from Chrome.",
    );
    expect(document.body.textContent).toContain(
      "Save highlights with the Chrome extension and revisit them in Readspace.",
    );
    const chromeStoreLink = document.querySelector<HTMLAnchorElement>(
      'a[href*="chromewebstore.google.com"]',
    );
    expect(chromeStoreLink?.textContent).toBe("Chrome extension");
    expect(chromeStoreLink?.target).toBe("_blank");
    expect(
      document.querySelector<HTMLAnchorElement>(
        'a[href="/support#changelog"]',
      )?.textContent,
    ).toBe("View full changelog");
  });

  it("stores the acknowledged major and minor release series", async () => {
    await render();

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Dismiss release announcement"]',
        )!
        .click();
    });

    expect(localStorage.getItem(RELEASE_ANNOUNCEMENT_SEEN_KEY)).toBe("1.9");

    act(() => root.unmount());
    root = createRoot(container);
    await render();

    expect(document.body.textContent).not.toContain("What’s new in FavLock");
  });

  it("shows again for the next minor or major release", async () => {
    localStorage.setItem(RELEASE_ANNOUNCEMENT_SEEN_KEY, "1.9");

    await render({
      version: "1.10.0",
      date: "October 1, 2026",
      changes: ["A new feature."],
    });

    expect(document.body.textContent).toContain("New in version 1.10.0");
  });

  it("does not show for patch releases", async () => {
    await render({
      version: "1.9.1",
      date: "September 6, 2026",
      changes: ["A reliability fix."],
    });

    expect(document.body.textContent).not.toContain("What’s new in FavLock");
    expect(localStorage.getItem(RELEASE_ANNOUNCEMENT_SEEN_KEY)).toBeNull();
  });
});
