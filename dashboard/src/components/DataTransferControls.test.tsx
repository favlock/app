import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTransferFileControl } from "./DataTransferControls";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <DataTransferFileControl
      id="test-file"
      inputRef={inputRef}
      accept=".favlock"
      fileName={fileName}
      emptyLabel="No file selected"
      onChange={(event) =>
        setFileName(event.target.files?.[0]?.name ?? null)
      }
    />
  );
}

describe("DataTransferFileControl", () => {
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

  it("uses the custom button to open the hidden input and shows its file", async () => {
    await act(async () => root.render(<Harness />));

    const input = container.querySelector<HTMLInputElement>("#test-file")!;
    const openFilePicker = vi.spyOn(input, "click");
    const button = container.querySelector<HTMLButtonElement>("button")!;

    await act(async () => button.click());
    expect(openFilePicker).toHaveBeenCalledOnce();

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["archive"], "backup.favlock")],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("backup.favlock");
  });
});
