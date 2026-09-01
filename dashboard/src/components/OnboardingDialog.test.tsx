import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markFirstRetrieval,
  markProtectionConfirmed,
  markProtectionPending,
  readOnboardingState,
  reconcileExistingAccountOnboarding,
  setLibraryPopulated,
} from "../lib/onboarding";
import OnboardingDialog from "./OnboardingDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function button(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  )!;
}

describe("OnboardingDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  const callbacks = {
    onClose: vi.fn(),
    onProtectLibrary: vi.fn(),
    onImportBookmarks: vi.fn(),
    onSaveFirstLink: vi.fn(),
    onFindSavedItem: vi.fn(),
  };

  const render = async (
    userId = "account-a",
    bookmarkWritesAllowed = true,
  ) => {
    await act(async () => {
      root.render(
        <OnboardingDialog
          open
          userId={userId}
          bookmarkWritesAllowed={bookmarkWritesAllowed}
          {...callbacks}
        />,
      );
    });
  };

  beforeEach(() => {
    localStorage.clear();
    Object.values(callbacks).forEach((callback) => callback.mockReset());
    markProtectionConfirmed("account-a", "passkey");
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

  it("offers import, manual save, and an explicit later path after protection", async () => {
    await render();

    expect(document.body.textContent).toContain("Getting started · 1 of 3 complete");
    expect(document.body.textContent).toContain("Protect your library");
    expect(document.body.textContent).toContain("Add your first item");
    expect(document.body.textContent).toContain("Find it again");
    expect(document.body.textContent).toContain("Import bookmarks");
    expect(document.body.textContent).toContain("Save one link");
    expect(document.body.textContent).toContain("Do this later");
    expect(document.body.textContent).toContain(
      "FavLock cannot read browser bookmarks by itself",
    );

    await act(async () => button("Import bookmarks").click());
    expect(callbacks.onImportBookmarks).toHaveBeenCalledOnce();
    expect(readOnboardingState("account-a").libraryPopulated).toBe("unknown");
    expect(readOnboardingState("account-a").dismissals.welcomeTour).toBe(false);
  });

  it("starts protection explicitly and cannot be dismissed before confirmation", async () => {
    localStorage.clear();
    markProtectionPending("account-a");
    await render();

    expect(document.body.textContent).toContain("Getting started · 0 of 3 complete");
    expect(document.body.textContent).toContain(
      "Choose how you’ll unlock your encrypted library.",
    );
    expect(document.body.textContent).toContain(
      "Start by choosing a durable way to unlock your library.",
    );
    expect(document.body.textContent).toContain("Set up");
    expect(document.body.textContent).not.toContain("Do this later");
    expect(
      document.querySelector(
        '[aria-label="Dismiss getting started checklist"]',
      ),
    ).toBeNull();

    await act(async () => button("Set up").click());

    expect(callbacks.onProtectLibrary).toHaveBeenCalledOnce();
    expect(readOnboardingState("account-a").protection.status).toBe("pending");
    expect(readOnboardingState("account-a").dismissals.welcomeTour).toBe(false);
  });

  it("keeps manual save fully valid and does not advance before success", async () => {
    await render();
    await act(async () => button("Save one link").click());

    expect(callbacks.onSaveFirstLink).toHaveBeenCalledOnce();
    expect(readOnboardingState("account-a").libraryPopulated).toBe("unknown");
  });

  it("dismisses without changing functional progress and remains account scoped", async () => {
    await render();
    await act(async () => button("Do this later").click());

    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(readOnboardingState("account-a")).toMatchObject({
      libraryPopulated: "unknown",
      firstRetrieval: "unknown",
      dismissals: { welcomeTour: true },
    });
    expect(readOnboardingState("account-b").dismissals.welcomeTour).toBeNull();
  });

  it("completes the final step when the user chooses to browse their library", async () => {
    setLibraryPopulated("account-a", true);
    await render();

    expect(document.body.textContent).toContain("Getting started · 2 of 3 complete");
    expect(document.body.textContent).toContain(
      "Make sure something you saved is easy to return to.",
    );
    expect(readOnboardingState("account-a").firstRetrieval).toBe("unknown");

    await act(async () => button("Browse my library").click());
    expect(callbacks.onFindSavedItem).toHaveBeenCalledOnce();
    expect(readOnboardingState("account-a").firstRetrieval).toBe("completed");
  });

  it("shows truthful progress for a protected old account with bookmarks", async () => {
    localStorage.clear();
    reconcileExistingAccountOnboarding("account-a");
    setLibraryPopulated("account-a", true);
    await render();

    expect(document.body.textContent).toContain(
      "Getting started · 2 of 3 complete",
    );
    expect(document.body.textContent).toContain(
      "Library protection is confirmed.",
    );
    expect(document.body.textContent).toContain(
      "You added a real bookmark or article.",
    );
    expect(document.body.textContent).toContain("Browse my library");
    expect(readOnboardingState("account-a").firstRetrieval).toBe("unknown");
  });

  it("shows completion only after a genuine retrieval is recorded", async () => {
    setLibraryPopulated("account-a", true);
    markFirstRetrieval("account-a");
    await render();

    expect(document.body.textContent).toContain("Getting started · 3 of 3 complete");
    expect(document.body.textContent).toContain(
      "Your library is ready",
    );
    expect(document.body.textContent).not.toContain("Explore FavLock");
    expect(document.body.textContent).toContain("Continue to FavLock");

    await act(async () => button("Continue to FavLock").click());
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });

  it("does not bypass an unavailable bookmark allowance", async () => {
    await render("account-a", false);

    expect(button("Import bookmarks").disabled).toBe(true);
    expect(button("Save one link").disabled).toBe(true);
    expect(document.body.textContent).toContain("does not permit another bookmark");
  });

  it("hides the Chrome branch on unsupported platforms", async () => {
    await render();
    expect(document.body.textContent).not.toContain("Save from Chrome (optional)");
  });

  it("offers the optional extension only on supported desktop Chrome", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    );
    vi.spyOn(window.navigator, "vendor", "get").mockReturnValue("Google Inc.");
    await render();

    expect(document.body.textContent).toContain("Save from Chrome (optional)");
    expect(document.body.textContent).toContain(
      "dashboard saves remain fully supported",
    );
    expect(document.body.textContent).toContain(
      "Install the extension, pair this account, then unlock its library",
    );

    setLibraryPopulated("account-a", true);
    markFirstRetrieval("account-a");
    await render();
    expect(document.body.textContent).not.toContain("Explore FavLock");
    expect(document.body.textContent).toContain("Continue to FavLock");
  });

  it("does not carry progress or dismissal across an account change", async () => {
    setLibraryPopulated("account-a", true);
    markFirstRetrieval("account-a");
    markProtectionConfirmed("account-b", "recovery-key");

    await render("account-a");
    expect(document.body.textContent).toContain("Getting started · 3 of 3 complete");
    await render("account-b");
    expect(document.body.textContent).toContain("Getting started · 1 of 3 complete");
    expect(document.body.textContent).toContain("Add your first item");
  });
});
