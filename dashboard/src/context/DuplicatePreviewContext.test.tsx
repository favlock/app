import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicatePreviewProvider } from "./DuplicatePreviewContext";
import { useSharedDuplicatePreview } from "./useSharedDuplicatePreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  accountPlan: { data: { id: "free" }, isError: false, isLoading: false } as {
    data: { id: string } | undefined;
    isError: boolean;
    isLoading: boolean;
  },
  useDuplicatePreview: vi.fn(),
}));

vi.mock("../hooks/useAccountPlanQuery", () => ({
  useAccountPlan: () => mocks.accountPlan,
}));
vi.mock("../hooks/useDuplicatePreview", () => ({
  useDuplicatePreview: mocks.useDuplicatePreview,
}));

function Probe() {
  return <span>{useSharedDuplicatePreview().status}</span>;
}

describe("DuplicatePreviewProvider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.accountPlan = {
      data: { id: "free" },
      isError: false,
      isLoading: false,
    };
    mocks.useDuplicatePreview
      .mockReset()
      .mockReturnValue({ status: "loading" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderProvider() {
    await act(async () => {
      root.render(
        <DuplicatePreviewProvider>
          <Probe />
        </DuplicatePreviewProvider>,
      );
    });
  }

  it("previews duplicates for accounts without Pro", async () => {
    await renderProvider();

    expect(mocks.useDuplicatePreview).toHaveBeenLastCalledWith(true);
    expect(container.textContent).toBe("loading");
  });

  it("previews duplicates for local vaults", async () => {
    mocks.accountPlan = { ...mocks.accountPlan, data: { id: "local" } };
    await renderProvider();

    expect(mocks.useDuplicatePreview).toHaveBeenLastCalledWith(true);
  });

  it.each([
    ["Pro accounts", { data: { id: "pro" }, isError: false, isLoading: false }],
    ["an unknown plan", { data: undefined, isError: false, isLoading: true }],
    ["a failed plan check", { data: undefined, isError: true, isLoading: false }],
  ])("does not scan for %s", async (_name, accountPlan) => {
    mocks.accountPlan = accountPlan;
    await renderProvider();

    expect(mocks.useDuplicatePreview).toHaveBeenLastCalledWith(false);
  });
});
