import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLocalVaultCloudMerge } from "../lib/localVaultCloudMerge";
import LocalVaultBanner from "./LocalVaultBanner";

const vaultId = "11111111-1111-4111-8111-111111111111";

function LocationProbe() {
  const location = useLocation();
  return <span>{location.pathname}{location.search}</span>;
}

describe("LocalVaultBanner", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("records an explicit merge intent before opening account sign-in", async () => {
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<LocalVaultBanner bookmarkCount={3} vaultId={vaultId} />} />
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    ));

    const button = Array.from(container.querySelectorAll("button"))
      .find((candidate) => candidate.textContent?.includes("Sync with an account"));
    expect(button).toBeDefined();
    await act(async () => button!.click());

    expect(readLocalVaultCloudMerge()?.sourceVaultId).toBe(vaultId);
    expect(container.textContent).toContain("/login?mode=sign-in&reconnect=1&merge=1");
  });

  it("allows its actions to wrap instead of overflowing the banner", async () => {
    await act(async () => root.render(
      <MemoryRouter>
        <LocalVaultBanner bookmarkCount={0} vaultId={vaultId} />
      </MemoryRouter>,
    ));

    const banner = container.querySelector('[aria-label="Local vault"]');
    const syncButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Sync with an account"));
    const actions = syncButton?.parentElement;

    expect(banner?.className).toContain("flex-wrap");
    expect(actions?.className).toContain("w-full");
    expect(actions?.className).toContain("xl:w-auto");
  });
});
