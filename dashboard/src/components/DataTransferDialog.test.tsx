import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataTransferDialog, { type DataTransferView } from "./DataTransferDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./BrowserBookmarkImportSection", () => ({
  default: () => <div>Existing bookmark import flow</div>,
}));

vi.mock("./DataExportSection", () => ({
  default: () => <div>Existing data export flow</div>,
}));

function Harness({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<DataTransferView | null>("chooser");

  return (
    <DataTransferDialog
      view={view}
      onViewChange={setView}
      onClose={() => {
        setView(null);
        onClose();
      }}
    />
  );
}

function findButton(label: string) {
  return Array.from(document.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );
}

describe("DataTransferDialog", () => {
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

  it("lets the user choose import or export and return to the chooser", async () => {
    await act(async () => {
      root.render(<Harness onClose={() => undefined} />);
    });

    expect(document.body.textContent).toContain("Import or export");
    expect(findButton("Import bookmarks")).toBeDefined();
    expect(findButton("Export data")).toBeDefined();

    await act(async () => {
      findButton("Import bookmarks")?.click();
    });
    expect(document.body.textContent).toContain("Existing bookmark import flow");

    await act(async () => {
      findButton("Back")?.click();
    });
    await act(async () => {
      findButton("Export data")?.click();
    });
    expect(document.body.textContent).toContain("Existing data export flow");
  });

  it("closes from the chooser", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<Harness onClose={onClose} />);
    });

    await act(async () => {
      findButton("Close")?.click();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
