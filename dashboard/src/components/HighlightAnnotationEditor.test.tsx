import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./ui/dialog";
import HighlightAnnotationEditor from "./HighlightAnnotationEditor";

describe("HighlightAnnotationEditor", () => {
  it("uses the compact private annotation layout and only offers removal for existing notes", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSave = vi.fn();
    const onRemove = vi.fn();

    await act(async () => root.render(
      <Dialog open onClose={vi.fn()}>
        <HighlightAnnotationEditor
          value="Existing note"
          saving={false}
          error={null}
          canRemove
          onChange={vi.fn()}
          onCancel={vi.fn()}
          onSave={onSave}
          onRemove={onRemove}
        />
      </Dialog>,
    ));

    expect(document.body.textContent).toContain("Private annotation");
    expect(document.body.textContent).toContain("Encrypted before it leaves this browser.");
    const remove = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Remove annotation",
    ) as HTMLButtonElement;
    const save = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Save",
    ) as HTMLButtonElement;
    await act(async () => {
      remove.click();
      save.click();
    });
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();

    await act(async () => root.render(
      <Dialog open onClose={vi.fn()}>
        <HighlightAnnotationEditor
          value=""
          saving={false}
          error={null}
          canRemove={false}
          onChange={vi.fn()}
          onCancel={vi.fn()}
          onSave={onSave}
          onRemove={onRemove}
        />
      </Dialog>,
    ));
    expect(document.body.textContent).not.toContain("Remove annotation");

    await act(async () => root.unmount());
    container.remove();
  });
});
