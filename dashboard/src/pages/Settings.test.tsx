import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "./Settings";

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    user: { email: "signed-in@favlock.app" },
    isLocalAccount: false,
  }),
}));
vi.mock("../hooks/useUserInfoQuery", () => ({
  useUserInfo: () => ({ data: null, isLoading: false }),
  useUpdateUserInfo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../lib/auth", () => ({ hasPasswordSignIn: () => false }));

vi.mock("../components/BillingSection", () => ({
  default: () => <div>Plan section</div>,
}));
vi.mock("../components/BillingManagementSection", () => ({
  default: () => <div>Billing management</div>,
}));
vi.mock("../components/ResourceUsageSection", () => ({ default: () => null }));
vi.mock("../components/AppearancePreference", () => ({ default: () => null }));
vi.mock("../components/SidebarItemLimitPreference", () => ({
  default: () => null,
}));
vi.mock("../components/BookmarkSearchShortcutPreference", () => ({
  default: () => null,
}));
vi.mock("../components/KeyTransferSection", () => ({ default: () => null }));
vi.mock("../components/PasskeySettingsSection", () => ({ default: () => null }));
vi.mock("../components/PasswordSignInSection", () => ({ default: () => null }));
vi.mock("../components/SearchHistoryPrivacySection", () => ({
  default: () => null,
}));
vi.mock("../components/SortStoragePreference", () => ({ default: () => null }));
vi.mock("../components/LocalPrivacySection", () => ({ default: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {`${location.pathname}${location.search}${location.hash}`}
    </output>
  );
}

describe("Settings tabs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderSettings(initialEntry: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              element={
                <>
                  <Outlet context={{ setIsMobileSidebarOpen: vi.fn() }} />
                  <LocationProbe />
                </>
              }
            >
              <Route path="settings/:tab?" element={<Settings />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  const selectedTab = () =>
    container.querySelector('[role="tab"][aria-selected="true"]')?.id;
  const currentLocation = () =>
    container.querySelector('[data-testid="location"]')?.textContent;

  it.each([
    ["/settings", "profile-tab"],
    ["/settings/preferences", "preferences-tab"],
    ["/settings/security", "security-tab"],
    ["/settings/usage", "usage-tab"],
    ["/settings/billing", "billing-tab"],
  ])("opens %s on its tab", async (path, tab) => {
    await renderSettings(path);
    expect(selectedTab()).toBe(tab);
    expect(currentLocation()).toBe(path);
  });

  it.each([
    ["/settings/usage", "Plan section", "Billing management"],
    ["/settings/billing", "Billing management", "Plan section"],
  ])("shows the right section on %s", async (path, shown, hidden) => {
    await renderSettings(path);
    expect(container.textContent).toContain(shown);
    expect(container.textContent).not.toContain(hidden);
  });

  it.each([
    ["/settings#preferences", "/settings/preferences", "preferences-tab"],
    ["/settings#security", "/settings/security", "security-tab"],
    ["/settings#settings", "/settings/security", "security-tab"],
    ["/settings#passkey", "/settings/security#passkey", "security-tab"],
    ["/settings#usage", "/settings/usage", "usage-tab"],
    [
      "/settings?billing=success&checkout_id=ch_test",
      "/settings/usage?billing=success&checkout_id=ch_test",
      "usage-tab",
    ],
    [
      "/settings?billing=success#usage",
      "/settings/usage?billing=success",
      "usage-tab",
    ],
  ])("redirects the legacy link %s", async (path, expected, tab) => {
    await renderSettings(path);
    expect(currentLocation()).toBe(expected);
    expect(selectedTab()).toBe(tab);
  });

  it("keeps layout dialog fragments on the Profile tab", async () => {
    await renderSettings("/settings?autoImport=chrome#import-bookmarks");
    expect(currentLocation()).toBe("/settings?autoImport=chrome#import-bookmarks");
    expect(selectedTab()).toBe("profile-tab");
  });

  it("lets an explicit tab path win over a checkout return marker", async () => {
    await renderSettings("/settings/security?billing=success");
    expect(currentLocation()).toBe("/settings/security?billing=success");
    expect(selectedTab()).toBe("security-tab");
  });

  it("redirects an unknown tab path to Settings", async () => {
    await renderSettings("/settings/unknown");
    expect(currentLocation()).toBe("/settings");
    expect(selectedTab()).toBe("profile-tab");
  });

  it.each([
    ["#profile-tab", "/settings?checkout_id=ch_test", "profile-tab"],
    ["#billing-tab", "/settings/billing?checkout_id=ch_test", "billing-tab"],
  ])("leaves the checkout return when %s is chosen", async (button, expected, tab) => {
    await renderSettings("/settings/usage?billing=success&checkout_id=ch_test");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(button)!.click();
    });

    expect(currentLocation()).toBe(expected);
    expect(selectedTab()).toBe(tab);
  });

  it("moves between tab paths from the keyboard without losing focus", async () => {
    await renderSettings("/settings/preferences");
    const preferencesTab =
      container.querySelector<HTMLButtonElement>("#preferences-tab")!;
    preferencesTab.focus();

    await act(async () => {
      preferencesTab.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    expect(currentLocation()).toBe("/settings/security");
    expect(selectedTab()).toBe("security-tab");
    expect(document.activeElement?.id).toBe("security-tab");

    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
    });

    expect(currentLocation()).toBe("/settings/billing");
    expect(document.activeElement?.id).toBe("billing-tab");
  });
});
