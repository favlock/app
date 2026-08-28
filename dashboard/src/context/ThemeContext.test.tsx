import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeVariant } from "../constants/themes";
import PublicOnlyRoute from "../components/PublicOnlyRoute";
import { ThemeProvider } from "./ThemeContext";
import { useTheme } from "./useTheme";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type MutationOptions = {
  onSuccess: () => void;
  onError: (error: Error) => void;
};

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userInfo: vi.fn(),
  mutate: vi.fn<(variant: ThemeVariant, options: MutationOptions) => void>(),
}));
vi.mock("./useAuth", () => ({ useAuth: mocks.auth }));
vi.mock("../hooks/useUserInfoQuery", () => ({
  useUserInfo: mocks.userInfo,
  useUpdateThemeVariant: () => ({ mutate: mocks.mutate }),
}));

describe("ThemeProvider optional browser preferences", () => {
  let container: HTMLDivElement;
  let root: Root;
  let context: ReturnType<typeof useTheme>;

  function Probe() {
    context = useTheme();
    return <span>{context.themeVariant}|{context.themeSaveError}</span>;
  }

  async function render() {
    await act(async () => root.render(<ThemeProvider><Probe /></ThemeProvider>));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.auth.mockReturnValue({ user: null, loading: false, cloudStatus: "signed_out", connectionError: null });
    mocks.userInfo.mockReturnValue({ data: null });
    mocks.mutate.mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete document.documentElement.dataset.themeVariant;
    vi.restoreAllMocks();
  });

  it.each<ThemeVariant>(["sunset", "retro", "neon", "aurora"])("loads the saved %s preference", async (variant) => {
    localStorage.setItem("themeVariant", variant);
    await render();

    expect(context.themeVariant).toBe(variant);
    expect(document.documentElement.dataset.themeVariant).toBe(variant);
  });

  it.each([null, "current", "invalid-theme"])("uses the default for missing or legacy preferences: %s", async (saved) => {
    if (saved !== null) localStorage.setItem("themeVariant", saved);
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem");
    await render();

    expect(context.themeVariant).toBe("sunset");
    expect(localStorage.getItem("themeVariant")).toBe(saved);
    expect(removeStorage).not.toHaveBeenCalled();
  });

  it("renders the authentication storage error when optional theme storage cannot be read", async () => {
    const connectionError = "Could not open your saved session. Check this browser's storage settings and reload FavLock.";
    mocks.auth.mockReturnValue({ user: null, loading: false, cloudStatus: "unavailable", connectionError });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Private storage diagnostic", "SecurityError");
    });
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem");

    await act(async () => root.render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <PublicOnlyRoute><Probe /></PublicOnlyRoute>
        </MemoryRouter>
      </ThemeProvider>,
    ));

    expect(context.themeVariant).toBe("sunset");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(connectionError);
    expect(container.querySelector("button")?.textContent).toBe("Reload FavLock");
    expect(removeStorage).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("applies a server preference even if its optional local write fails", async () => {
    mocks.auth.mockReturnValue({ user: { id: "fake-user" } });
    mocks.userInfo.mockReturnValue({ data: { theme_variant: "neon" } });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    const removeStorage = vi.spyOn(Storage.prototype, "removeItem");
    await render();

    expect(context.themeVariant).toBe("neon");
    expect(document.documentElement.dataset.themeVariant).toBe("neon");
    expect(context.themeSaveError).toBeNull();
    expect(removeStorage).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("still saves an authenticated preference when browser persistence fails", async () => {
    mocks.auth.mockReturnValue({ user: { id: "fake-user" } });
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    await act(async () => context.setThemeVariant("aurora"));

    expect(context.themeVariant).toBe("aurora");
    expect(document.documentElement.dataset.themeVariant).toBe("aurora");
    expect(mocks.mutate).toHaveBeenCalledWith("aurora", expect.any(Object));
  });

  it("does not hide a cloud authorization error behind an optional preference failure", async () => {
    mocks.auth.mockReturnValue({ user: { id: "fake-user" } });
    mocks.mutate.mockImplementation((_variant, options) => options.onError(new Error("Cloud access requires reconnection.")));
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    await act(async () => context.setThemeVariant("retro"));

    expect(context.themeVariant).toBe("retro");
    expect(context.themeSaveError).toBe("Cloud access requires reconnection.");
    await act(async () => context.retryThemeSave());
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
    expect(mocks.mutate.mock.calls[1][0]).toBe("retro");
  });

  it("keeps a signed-out preference local and persists it when storage works", async () => {
    await render();
    await act(async () => context.setThemeVariant("retro"));

    expect(context.themeVariant).toBe("retro");
    expect(localStorage.getItem("themeVariant")).toBe("retro");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
