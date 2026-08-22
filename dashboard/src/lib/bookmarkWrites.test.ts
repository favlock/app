import { describe, expect, it, vi } from "vitest";
import { prepareBookmarkTags } from "./bookmarkWrites";
import type { Tag } from "../types/bookmark";

const existingTags: Tag[] = [
  {
    id: "tag-existing",
    user_id: "user-1",
    name: "research",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

describe("prepareBookmarkTags", () => {
  it("reuses existing decrypted tags and encrypts only new normalized names", async () => {
    const encryptField = vi.fn(async (value: string) => `encrypted:${value}`);

    await expect(
      prepareBookmarkTags(
        [" Research ", "#Ideas", "ideas", "", "#research"],
        existingTags,
        encryptField,
      ),
    ).resolves.toEqual({
      existingTagIds: ["tag-existing"],
      newEncryptedTagNames: ["encrypted:ideas"],
    });
    expect(encryptField).toHaveBeenCalledTimes(1);
    expect(encryptField).toHaveBeenCalledWith("ideas");
  });

  it("returns empty arrays when no usable tag names are provided", async () => {
    const encryptField = vi.fn(async (value: string) => `encrypted:${value}`);

    await expect(
      prepareBookmarkTags(["", "#", "   "], existingTags, encryptField),
    ).resolves.toEqual({
      existingTagIds: [],
      newEncryptedTagNames: [],
    });
    expect(encryptField).not.toHaveBeenCalled();
  });
});
