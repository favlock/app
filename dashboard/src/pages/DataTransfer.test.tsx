import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataTransfer from "./DataTransfer";

const { authState } = vi.hoisted(() => ({
  authState: { isLocalAccount: false },
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ isLocalAccount: authState.isLocalAccount }),
}));

vi.mock("../components/BrowserBookmarkImportSection", () => ({
  default: () => <div>Cloud bookmark import</div>,
}));
vi.mock("../components/LocalBrowserBookmarkImportSection", () => ({
  default: () => <div>Local bookmark import</div>,
}));
vi.mock("../components/DataExportSection", () => ({
  default: () => <div>Data export tools</div>,
}));
vi.mock("../components/FavLockMigrationImportSection", () => ({
  default: () => <div>Account migration tools</div>,
}));
vi.mock("../components/LocalVaultRestoreSection", () => ({
  default: () => <div>Local restore tools</div>,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("DataTransfer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    authState.isLocalAccount = false;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderPage(initialEntry = "/data-transfer") {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              element={
                <Outlet
                  context={{
                    setIsMobileSidebarOpen: vi.fn(),
                    openAddBookmark: vi.fn(),
                  }}
                />
              }
            >
              <Route path="data-transfer" element={<DataTransfer />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  it("shows import, export, and migrate as accessible tabs", async () => {
    await renderPage();

    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      "Import",
      "Export",
      "Migrate",
    ]);
    expect(container.querySelector("#import-tab")?.getAttribute("aria-selected"))
      .toBe("true");
    expect(container.textContent).toContain("Cloud bookmark import");
  });

  it("opens the requested tab from the URL and switches panels", async () => {
    await renderPage("/data-transfer#export");
    expect(container.querySelector("#export-tab")?.getAttribute("aria-selected"))
      .toBe("true");
    expect(container.textContent).toContain("Data export tools");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#migrate-tab")?.click();
    });
    expect(container.querySelector("#migrate-tab")?.getAttribute("aria-selected"))
      .toBe("true");
    expect(container.textContent).toContain("Account migration tools");
  });

  it("uses local transfer tools for a local vault", async () => {
    authState.isLocalAccount = true;
    await renderPage("/data-transfer#migrate");
    expect(container.textContent).toContain("Local restore tools");
  });

  it("keeps the export tab visible but explains when cloud export is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await renderPage("/data-transfer#export");
    expect(container.querySelector("#export-tab")).not.toBeNull();
    expect(container.textContent).toContain("Export unavailable offline");
    expect(container.textContent).toContain("Reconnect to export your data.");
  });
});
