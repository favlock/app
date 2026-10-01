export const SAVE_PAGE_CONTEXT_MENU_ID = "favlock-save-page";
export const SAVE_HIGHLIGHT_CONTEXT_MENU_ID = "favlock-save-highlight";

export const FAVLOCK_CONTEXT_MENU_ITEMS = [
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
];
