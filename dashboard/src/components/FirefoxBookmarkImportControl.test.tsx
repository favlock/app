import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FirefoxBookmarkImportControl from "./FirefoxBookmarkImportControl";

const origin = "moz-extension://11111111-1111-4111-8111-111111111111";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState({}, "", `/settings?firefoxExtensionOrigin=${encodeURIComponent(origin)}&autoImport=firefox`);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

function message(frame: HTMLIFrameElement, data: unknown, eventOrigin = origin) {
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: eventOrigin, data }));
}

describe("Firefox bookmark import control", () => {
  it("previews only a correlated response from its ready iframe", async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(<BrowserRouter><FirefoxBookmarkImportControl disabled={false} onImport={onImport} /></BrowserRouter>));
    const frame = container.querySelector("iframe")!;
    const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
    await act(async () => message(frame, { type: "FAVLOCK_FIREFOX_EXTENSION_READY" }, "https://evil.example"));
    expect(post).not.toHaveBeenCalled();
    await act(async () => message(frame, { type: "FAVLOCK_FIREFOX_EXTENSION_READY" }));
    expect(post).toHaveBeenCalledOnce();
    const request = post.mock.calls[0][0];
    const response = { type: "FAVLOCK_FIREFOX_BOOKMARKS_RESULT", requestId: request.requestId, tree: [{ title: "Firefox bookmark", url: "https://example.com" }] };
    await act(async () => message(frame, response, "https://evil.example"));
    await act(async () => message(frame, { ...response, requestId: "wrong" }));
    expect(onImport).not.toHaveBeenCalled();
    await act(async () => message(frame, response));
    expect(onImport).toHaveBeenCalledExactlyOnceWith({ bookmarks: [{ title: "Firefox bookmark", url: "https://example.com", folderPath: [] }], folderPaths: [] });
    await act(async () => message(frame, response));
    expect(onImport).toHaveBeenCalledOnce();
    expect(new URLSearchParams(window.location.search).has("autoImport")).toBe(false);
  });
  it("does not request while the library is locked or busy", async () => {
    await act(async () => root.render(<BrowserRouter><FirefoxBookmarkImportControl disabled onImport={vi.fn()} /></BrowserRouter>));
    const frame = container.querySelector("iframe")!;
    const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
    await act(async () => message(frame, { type: "FAVLOCK_FIREFOX_EXTENSION_READY" }));
    expect(post).not.toHaveBeenCalled();
    expect(container.querySelector("button")?.disabled).toBe(true);
  });
});
