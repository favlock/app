import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DataTransferDialog, { type DataTransferView } from "./DataTransferDialog";

const { loadExport } = vi.hoisted(() => ({ loadExport: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./BrowserBookmarkImportSection", () => ({
  default: () => <div>Existing bookmark import flow</div>,
}));

vi.mock("./FavLockMigrationImportSection", () => ({
  default: () => <div>Encrypted FavLock migration flow</div>,
}));

vi.mock("./DataExportSection", () => {
  loadExport();
  return { default: () => <div>Existing data export flow</div> };
});

function Harness({ onClose, initialView = "chooser" }: { onClose: () => void; initialView?: DataTransferView }) {
  const [view, setView] = useState<DataTransferView | null>(initialView);

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

  it("hides export in the offline chooser without loading export tools", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => root.render(<Harness onClose={() => undefined} />));

    expect(findButton("Export data")).toBeUndefined();
    expect(findButton("Import bookmarks")).toBeDefined();
    expect(findButton("Migrate account")).toBeDefined();
    expect(document.body.textContent).toContain("Reconnect to export your data.");
    expect(loadExport).not.toHaveBeenCalled();
  });

  it("blocks a direct export view offline before importing its lazy module", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const onClose = vi.fn();
    await act(async () => root.render(<Harness initialView="export" onClose={onClose} />));

    expect(document.body.textContent).toContain("Export unavailable offline");
    expect(document.body.textContent).not.toContain("Existing data export flow");
    expect(loadExport).not.toHaveBeenCalled();
    await act(async () => findButton("Close")?.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("updates the chooser when connectivity changes", async () => {
    await act(async () => root.render(<Harness onClose={() => undefined} />));
    expect(findButton("Export data")).toBeDefined();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(findButton("Export data")).toBeUndefined();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(findButton("Export data")).toBeDefined();
  });

  it("keeps import, export, and migration in separate focused views", async () => {
    await act(async () => {
      root.render(<Harness onClose={() => undefined} />);
    });

    expect(document.body.textContent).toContain("Data transfer");
    expect(findButton("Import bookmarks")).toBeDefined();
    expect(findButton("Export data")).toBeDefined();
    expect(findButton("Migrate account")).toBeDefined();

    await act(async () => {
      findButton("Import bookmarks")?.click();
    });
    expect(document.body.textContent).toContain("Existing bookmark import flow");
    expect(document.body.textContent).not.toContain(
      "Encrypted FavLock migration flow",
    );

    await act(async () => {
      findButton("Back")?.click();
    });
    await act(async () => {
      findButton("Migrate account")?.click();
    });
    expect(document.body.textContent).toContain("Encrypted FavLock migration flow");
    expect(document.body.textContent).not.toContain(
      "Existing bookmark import flow",
    );

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

  it("replaces already open export tools when going offline and restores them online", async () => {
    await act(async () => root.render(<Harness initialView="export" onClose={() => undefined} />));
    expect(document.body.textContent).toContain("Existing data export flow");

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(document.body.textContent).toContain("Export unavailable offline");
    expect(document.body.textContent).not.toContain("Existing data export flow");

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(document.body.textContent).toContain("Existing data export flow");
  });
});
