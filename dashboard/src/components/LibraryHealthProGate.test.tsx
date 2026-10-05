import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DuplicatePreview } from "../hooks/useDuplicatePreview";
import type { BookmarkDuplicateGroup } from "../lib/bookmarkDuplicates";
import LibraryHealthProGate, {
  type LibraryHealthFeature,
} from "./LibraryHealthProGate";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  accountPlan: { id: "free", name: "Free" } as
    | { id: string; name: string }
    | undefined,
  duplicatePreview: { status: "unavailable" } as DuplicatePreview,
  isError: false,
  isLoading: false,
  isLocalAccount: false,
  refetch: vi.fn(),
  setIsMobileSidebarOpen: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useOutletContext: () => ({
    setIsMobileSidebarOpen: mocks.setIsMobileSidebarOpen,
  }),
}));

vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => ({
    data: mocks.accountPlan,
    isError: mocks.isError,
    isLoading: mocks.isLoading,
    refetch: mocks.refetch,
  }),
}));
vi.mock("../context/useSharedDuplicatePreview", () => ({
  useSharedDuplicatePreview: () => mocks.duplicatePreview,
}));
vi.mock("../context/useAuth", () => ({
  useAuth: () => ({ isLocalAccount: mocks.isLocalAccount }),
}));

function duplicateGroup(index: number, copies = 2): BookmarkDuplicateGroup {
  const url = `https://site-${index}.example/page`;
  const bookmark = (id: string) => ({
    id,
    title: `Saved page ${index}`,
    url,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  return {
    normalizedUrl: url,
    keeper: bookmark(`keeper-${index}`),
    duplicates: Array.from({ length: copies - 1 }, (_, copy) =>
      bookmark(`copy-${index}-${copy}`),
    ),
    matchNote: "Same normalized URL.",
  };
}

describe("LibraryHealthProGate", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.accountPlan = { id: "free", name: "Free" };
    mocks.duplicatePreview = { status: "unavailable" };
    mocks.isError = false;
    mocks.isLoading = false;
    mocks.isLocalAccount = false;
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderGate(feature: LibraryHealthFeature = "duplicates") {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LibraryHealthProGate feature={feature}>
            <div>Protected health tools</div>
          </LibraryHealthProGate>
        </MemoryRouter>,
      );
    });
  }

  it("shows the upgrade state instead of health tools for Free accounts", async () => {
    await renderGate();

    expect(container.textContent).toContain(
      "Library health is included with Pro",
    );
    expect(container.textContent).not.toContain("Protected health tools");
    expect(container.querySelector('a[href="/checkout"]')).not.toBeNull();
  });

  it("renders health tools for Pro accounts", async () => {
    mocks.accountPlan = { id: "pro", name: "Pro" };
    await renderGate();

    expect(container.textContent).toContain("Protected health tools");
    expect(container.textContent).not.toContain(
      "Library health is included with Pro",
    );
  });

  it("waits for the plan before showing an upgrade state", async () => {
    mocks.accountPlan = undefined;
    mocks.isLoading = true;
    await renderGate();

    expect(container.textContent).toContain("Checking your plan…");
    expect(container.querySelector('a[href="/checkout"]')).toBeNull();
  });

  it("shows the real duplicate count and a few examples to Free accounts", async () => {
    mocks.duplicatePreview = {
      status: "ready",
      scannedCount: 412,
      duplicateCount: 6,
      groups: [
        duplicateGroup(1, 3),
        duplicateGroup(2),
        duplicateGroup(3),
        duplicateGroup(4),
        duplicateGroup(5),
      ],
    };
    await renderGate();

    expect(container.textContent).toContain(
      "6 duplicate bookmarks in your library",
    );
    expect(container.textContent).toContain(
      "Found across 5 pages in 412 bookmarks on this device.",
    );
    const examples = container.querySelectorAll(
      'ul[aria-label="Duplicate bookmark examples"] li',
    );
    expect(examples).toHaveLength(3);
    expect(examples[0].textContent).toContain("Saved page 1");
    expect(examples[0].textContent).toContain("site-1.example");
    expect(examples[0].textContent).toContain("3 copies");
    expect(container.textContent).toContain(
      "and 2 more pages with duplicates",
    );
    expect(container.querySelector('a[href="/checkout"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Protected health tools");
  });

  it("tells Free accounts when no duplicates were found", async () => {
    mocks.duplicatePreview = {
      status: "ready",
      scannedCount: 1,
      duplicateCount: 0,
      groups: [],
    };
    await renderGate();

    expect(container.textContent).toContain("No duplicates right now");
    expect(container.textContent).toContain("We checked 1 bookmark on this device.");
  });

  it("keeps the general upgrade copy for an empty library", async () => {
    mocks.duplicatePreview = {
      status: "ready",
      scannedCount: 0,
      duplicateCount: 0,
      groups: [],
    };
    await renderGate();

    expect(container.textContent).toContain(
      "Library health is included with Pro",
    );
    expect(container.textContent).not.toContain("No duplicates right now");
  });

  it("announces a duplicate preview that is still running", async () => {
    mocks.duplicatePreview = { status: "loading" };
    await renderGate();

    expect(
      [...container.querySelectorAll('[role="status"]')].map(
        (element) => element.textContent,
      ),
    ).toContain("Checking your library for duplicates…");
  });

  it("explains broken-link checks on that tab", async () => {
    await renderGate("broken-links");

    expect(container.textContent).toContain(
      "Catch broken links before you need them",
    );
    expect(container.textContent).toContain(
      "sent temporarily to FavLock’s API for checking",
    );
    expect(
      container.querySelector('a[href="/library-health/duplicates"]'),
    ).not.toBeNull();
    expect(container.querySelector('a[href="/checkout"]')).not.toBeNull();
  });

  it("sends local vaults through the established cloud connection flow", async () => {
    mocks.accountPlan = { id: "local", name: "Local" };
    mocks.isLocalAccount = true;
    mocks.duplicatePreview = {
      status: "ready",
      scannedCount: 10,
      duplicateCount: 1,
      groups: [duplicateGroup(1)],
    };
    await renderGate();

    expect(container.textContent).toContain(
      "1 duplicate bookmark in your library",
    );
    expect(container.textContent).toContain("Connect a Pro cloud account");
    expect(
      container.querySelector(
        'a[href="/login?mode=sign-in&reconnect=1&merge=1"]',
      ),
    ).not.toBeNull();
  });
});
