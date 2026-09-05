import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocalEncryptedDataDialog from "./LocalEncryptedDataDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const { readLocalEncryptedPreview } = vi.hoisted(() => ({
  readLocalEncryptedPreview: vi.fn(),
}));

vi.mock("../lib/localVault", () => ({ readLocalEncryptedPreview }));

describe("LocalEncryptedDataDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    readLocalEncryptedPreview.mockReset().mockResolvedValue([{
        kind: "Collection",
        protectedFields: [{ label: "name", ciphertext: "enc:collection" }],
        metadata: [{ label: "created", value: "2026-09-03T08:00:00.000Z" }],
      }, {
        kind: "Tag",
        protectedFields: [{ label: "name", ciphertext: "enc:tag" }],
        metadata: [{ label: "created", value: "2026-09-03T08:00:00.000Z" }],
      }]);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("explains that the encrypted records are a limited sample", async () => {
    await act(async () => root.render(
      <LocalEncryptedDataDialog
        open
        vaultId="local-vault"
        onClose={() => undefined}
      />,
    ));
    await vi.waitFor(() => expect(readLocalEncryptedPreview).toHaveBeenCalledOnce());

    expect(document.body.textContent).toContain(
      "this view shows only a limited sample",
    );
    expect(document.body.textContent).not.toContain("totals below");
    expect(document.body.textContent).not.toContain("Showing 1 of");
  });
});
