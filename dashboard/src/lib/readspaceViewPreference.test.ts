import { beforeEach, describe, expect, it } from "vitest";
import {
  loadReadspaceView,
  READSPACE_VIEW_STORAGE_KEY,
  saveReadspaceView,
} from "./readspaceViewPreference";

describe("readspace view preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to articles", () => {
    expect(loadReadspaceView()).toBe("articles");
  });

  it("restores the highlights tab", () => {
    window.localStorage.setItem(READSPACE_VIEW_STORAGE_KEY, "highlights");

    expect(loadReadspaceView()).toBe("highlights");
  });

  it("ignores an invalid stored value", () => {
    window.localStorage.setItem(READSPACE_VIEW_STORAGE_KEY, "invalid");

    expect(loadReadspaceView()).toBe("articles");
  });

  it("saves the selected tab", () => {
    saveReadspaceView("highlights");

    expect(window.localStorage.getItem(READSPACE_VIEW_STORAGE_KEY)).toBe(
      "highlights",
    );
  });
});
