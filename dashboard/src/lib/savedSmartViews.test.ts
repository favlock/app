import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSavedSmartView, loadSavedSmartViews, updateSavedSmartView } from "./savedSmartViews";
import { DEFAULT_LIBRARY_SEARCH_FILTERS } from "./librarySearchFilters";
import { SMART_VIEW_ICONS } from "../constants/smartViewIcons";

const requests = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("./authenticatedApi", () => ({
  fetchAuthenticatedJson: requests.get,
  postAuthenticatedJson: requests.post,
  patchAuthenticatedJson: requests.patch,
  deleteAuthenticatedWithoutResponse: vi.fn(),
}));

const id = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-09-24T12:00:00.000Z";
const view = { name: "Design ideas", icon: "sparkles", color: "BLUE" as const,
  query: "private topic", filters: { ...DEFAULT_LIBRARY_SEARCH_FILTERS, tagId: "tag-id" } };

beforeEach(() => {
  requests.get.mockReset();
  requests.post.mockReset();
  requests.patch.mockReset();
});

describe("Saved Smart Views encryption boundary", () => {
  it("offers 60 distinct generic icons including transport choices", () => {
    expect(SMART_VIEW_ICONS).toHaveLength(60);
    const ids = SMART_VIEW_ICONS.map((icon) => icon.id);
    expect(new Set(ids).size).toBe(60);
    expect(ids).toEqual(expect.arrayContaining(["car", "bike", "plane"]));
  });

  it("sends ciphertext containing the complete protected definition", async () => {
    requests.post.mockResolvedValue({ data: { id, encryptedView: "enc:opaque", createdAt } });
    const encrypt = vi.fn().mockResolvedValue("enc:opaque");
    await expect(createSavedSmartView("token", view, encrypt)).resolves.toEqual({ ...view, id, createdAt });
    expect(JSON.parse(encrypt.mock.calls[0]?.[0] as string)).toEqual({ version: 1, ...view });
    expect(requests.post.mock.calls[0]?.[2]).toEqual({ encryptedView: "enc:opaque" });
    expect(JSON.stringify(requests.post.mock.calls[0]?.[2])).not.toContain(view.query);
    expect(JSON.stringify(requests.post.mock.calls[0]?.[2])).not.toContain(view.name);
  });

  it("rejects malformed decrypted definitions instead of rendering them", async () => {
    requests.get.mockResolvedValue({ data: [{ id, encryptedView: "enc:bad", createdAt }] });
    await expect(loadSavedSmartViews("token", async () => JSON.stringify({ version: 1,
      ...view, icon: "script" }))).rejects.toThrow("could not be decrypted");
  });

  it("rejects empty searches and names before sending", async () => {
    const encrypt = vi.fn();
    await expect(createSavedSmartView("token", { ...view, name: " " }, encrypt)).rejects.toThrow();
    await expect(createSavedSmartView("token", { ...view, query: "", filters: DEFAULT_LIBRARY_SEARCH_FILTERS }, encrypt)).rejects.toThrow();
    expect(encrypt).not.toHaveBeenCalled();
    expect(requests.post).not.toHaveBeenCalled();
  });

  it("updates appearance while preserving the encrypted search and filters", async () => {
    requests.patch.mockResolvedValue({ data: { id, encryptedView: "enc:updated", createdAt } });
    const encrypt = vi.fn().mockResolvedValue("enc:updated");
    const appearance = { name: "Fresh ideas", icon: "bookmark", color: "GREEN" as const };
    const original = { ...view, id, createdAt };
    await expect(updateSavedSmartView("token", original, appearance, encrypt))
      .resolves.toEqual({ ...original, ...appearance });
    expect(JSON.parse(encrypt.mock.calls[0]?.[0] as string)).toEqual({ version: 1, ...view, ...appearance });
    expect(requests.patch).toHaveBeenCalledWith(`/v1/account/saved-smart-views/${id}`,
      "token", { encryptedView: "enc:updated" }, "Could not update Smart View.");
    expect(JSON.stringify(requests.patch.mock.calls[0]?.[2])).not.toContain(view.query);
  });

  it("rejects an invalid edit before encrypting or sending it", async () => {
    const encrypt = vi.fn();
    await expect(updateSavedSmartView("token", { ...view, id, createdAt },
      { name: " ", icon: "bookmark", color: "GREEN" }, encrypt)).rejects.toThrow();
    expect(encrypt).not.toHaveBeenCalled();
    expect(requests.patch).not.toHaveBeenCalled();
  });
});
