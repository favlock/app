import { describe, expect, it } from "vitest";
import {
  FAVLOCK_CONTEXT_MENU_ITEMS,
  SAVE_HIGHLIGHT_CONTEXT_MENU_ID,
  SAVE_PAGE_CONTEXT_MENU_ID,
} from "./extension-context-menu.js";

describe("FavLock context menu", () => {
  it("defines mutually exclusive top-level page and selection actions", () => {
    expect(FAVLOCK_CONTEXT_MENU_ITEMS).toEqual([
      {
        id: SAVE_PAGE_CONTEXT_MENU_ID,
        title: "Save page",
        contexts: ["page"],
      },
      {
        id: SAVE_HIGHLIGHT_CONTEXT_MENU_ID,
        title: "Save highlight",
        contexts: ["selection"],
      },
    ]);
    expect(FAVLOCK_CONTEXT_MENU_ITEMS.every((item) => !("parentId" in item))).toBe(true);
  });
});
