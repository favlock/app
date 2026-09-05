import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  captureCurrentSelection,
  readSettledHighlightRenderResult,
  renderSavedHighlights,
  showHighlightNotice,
} from "./highlight-page.js";

describe("web highlight page capture", () => {
  it("captures quote context and resilient anchors from the explicit selection", () => {
    const dom = new JSDOM("<body><main><p>Before the selected passage after.</p></main></body>");
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    try {
      const text = dom.window.document.querySelector("p").firstChild;
      const range = dom.window.document.createRange();
      range.setStart(text, 11);
      range.setEnd(text, 27);
      dom.window.getSelection().addRange(range);

      expect(captureCurrentSelection()).toMatchObject({
        version: 1,
        quote: { exact: "selected passage" },
        position: { start: 11, end: 27 },
        dom: { startOffset: 11, endOffset: 27 },
        color: "yellow",
        note: "",
      });
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      dom.window.close();
    }
  });

  it("shows unmatched restoration as a calm warning rather than an error", () => {
    const dom = new JSDOM("<body></body>");
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    try {
      showHighlightNotice("The page may have changed.", "warning");
      const notice = dom.window.document.getElementById("favlock-highlight-feedback");
      expect(notice?.getAttribute("role")).toBe("status");
      expect(notice?.textContent).toBe("The page may have changed.");
      expect(notice?.style.background).toBe("rgb(255, 251, 235)");
      expect(notice?.style.color).toBe("rgb(146, 64, 14)");
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      dom.window.close();
    }
  });

  it("reads the latest render result after dynamic content settles", async () => {
    const dom = new JSDOM("<body></body>");
    const previousWindow = globalThis.window;
    globalThis.window = dom.window;
    vi.useFakeTimers();
    try {
      dom.window.__favlockHighlightRenderResult = {
        matched: 1,
        total: 2,
        controls: 1,
      };
      const resultPromise = readSettledHighlightRenderResult(750);
      dom.window.__favlockHighlightRenderResult = {
        matched: 2,
        total: 2,
        controls: 2,
      };
      await vi.advanceTimersByTimeAsync(750);

      await expect(resultPromise).resolves.toEqual({
        matched: 2,
        total: 2,
        controls: 2,
      });
    } finally {
      vi.useRealTimers();
      globalThis.window = previousWindow;
      dom.window.close();
    }
  });

  it("restores a saved quote without changing the page text", () => {
    const dom = new JSDOM("<body><main><p>Before the saved passage after.</p></main></body>");
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousMutationObserver = globalThis.MutationObserver;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    dom.window.Range.prototype.getClientRects = () => [{ right: 200, top: 30 }];
    try {
      const payload = {
        quote: { exact: "saved passage", prefix: "Before the ", suffix: " after." },
        dom: null,
        color: "yellow",
      };
      const highlight = {
        id: "00000000-0000-4000-8000-000000000001",
        payload,
      };
      expect(renderSavedHighlights([highlight])).toEqual({
        matched: 1,
        total: 1,
        controls: 1,
      });
      expect(dom.window.document.querySelector("mark")?.textContent).toBe("saved passage");
      expect(dom.window.document.body.textContent).toBe("Before the saved passage after.");
      expect(dom.window.document.getElementById("favlock-highlight-controls")).not.toBeNull();
      const highlightStyles = dom.window.document.getElementById(
        "favlock-highlight-styles",
      )?.textContent;
      expect(highlightStyles).toContain("background-color: #fde68a");
      expect(highlightStyles).not.toMatch(/\bbackground:/);

      renderSavedHighlights([highlight]);
      expect(dom.window.document.querySelectorAll("mark")).toHaveLength(1);

      const pendingPayload = {
        quote: { exact: "Before", prefix: "", suffix: " the" },
        dom: null,
        color: "green",
      };
      expect(renderSavedHighlights([{
        id: "pending-create-1",
        payload: pendingPayload,
      }], true)).toEqual({ matched: 2, total: 2, controls: 1 });
      expect(dom.window.document.querySelectorAll("mark")).toHaveLength(2);

      expect(renderSavedHighlights([{
        id: "00000000-0000-4000-8000-000000000002",
        payload: pendingPayload,
      }], true, false, "pending-create-1")).toEqual({
        matched: 2,
        total: 2,
        controls: 2,
      });

      expect(renderSavedHighlights([highlight], false, true)).toEqual({
        matched: 1,
        total: 1,
        controls: 1,
      });
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.MutationObserver = previousMutationObserver;
      dom.window.close();
    }
  });

  it("uses the saved text position when the DOM path drifts and a quote repeats", () => {
    const dom = new JSDOM(
      "<body><p>Repeat target.</p><section><p>Repeat target.</p></section></body>",
    );
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousMutationObserver = globalThis.MutationObserver;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    dom.window.Range.prototype.getClientRects = () => [{ right: 200, top: 30 }];
    try {
      const payload = {
        quote: { exact: "Repeat target", prefix: "", suffix: "" },
        position: { start: 14, end: 27 },
        dom: {
          startPath: "1/0",
          startOffset: 0,
          endPath: "1/0",
          endOffset: 13,
        },
        color: "yellow",
      };

      expect(renderSavedHighlights([{
        id: "00000000-0000-4000-8000-000000000004",
        payload,
      }])).toMatchObject({ matched: 1, total: 1 });

      expect(dom.window.document.querySelector("body > p mark")).toBeNull();
      expect(dom.window.document.querySelector("section mark")?.textContent).toBe(
        "Repeat target",
      );
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.MutationObserver = previousMutationObserver;
      dom.window.close();
    }
  });

  it("rolls back failed optimistic deletion and color changes", async () => {
    const dom = new JSDOM("<body><p>Hover this saved passage here.</p></body>");
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousMutationObserver = globalThis.MutationObserver;
    const previousChrome = globalThis.chrome;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    dom.window.Range.prototype.getClientRects = () => [{
      left: 20,
      right: 160,
      top: 30,
      bottom: 48,
    }];
    const originalAttachShadow = dom.window.Element.prototype.attachShadow;
    const originalAddEventListener = dom.window.EventTarget.prototype.addEventListener;
    let deleteClickHandler;
    let colorButtonClickHandler;
    let pinkSwatchClickHandler;
    dom.window.Element.prototype.attachShadow = function attachOpenShadow(init) {
      return originalAttachShadow.call(this, { ...init, mode: "open" });
    };
    dom.window.EventTarget.prototype.addEventListener = function captureDeleteClick(
      type,
      listener,
      options,
    ) {
      if (type === "click" && this.classList?.contains("remove")) {
        deleteClickHandler = listener;
      }
      if (type === "click" && this.title === "Change FavLock highlight color") {
        colorButtonClickHandler = listener;
      }
      if (type === "click" && this.title === "Pink highlight") {
        pinkSwatchClickHandler = listener;
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
    const deleteRequests = [];
    const sendMessage = vi.fn(() => new Promise((resolve) => {
      deleteRequests.push(resolve);
    }));
    globalThis.chrome = { runtime: { sendMessage } };
    const highlight = {
      id: "00000000-0000-4000-8000-000000000003",
      payload: {
        quote: { exact: "saved passage", prefix: "Hover this ", suffix: " here." },
        dom: null,
        color: "blue",
      },
    };
    try {
      renderSavedHighlights([highlight], false, true);

      const host = dom.window.document.getElementById("favlock-highlight-controls");
      const control = host.shadowRoot.querySelector(".control");
      control.getBoundingClientRect = () => ({
        left: 163,
        right: 221,
        top: 27,
        bottom: 48,
      });
      expect(control.dataset.visible).toBe("false");

      dom.window.document.dispatchEvent(new dom.window.MouseEvent("mousemove", {
        clientX: 80,
        clientY: 38,
      }));
      expect(control.dataset.visible).toBe("true");

      dom.window.document.dispatchEvent(new dom.window.MouseEvent("mousemove", {
        clientX: 180,
        clientY: 38,
      }));
      expect(control.dataset.visible).toBe("true");

      dom.window.document.dispatchEvent(new dom.window.MouseEvent("mousemove", {
        clientX: 400,
        clientY: 300,
      }));
      expect(control.dataset.visible).toBe("false");

      deleteClickHandler({ isTrusted: true });
      expect(dom.window.document.getElementById("favlock-highlight-controls")).toBeNull();
      expect(dom.window.document.querySelector("mark")?.textContent).toBeUndefined();
      expect(sendMessage).toHaveBeenCalledWith({
        type: "favlock.highlight.delete",
        highlightId: "00000000-0000-4000-8000-000000000003",
      });
      deleteRequests[0]({ ok: true });
      await Promise.resolve();

      renderSavedHighlights([highlight], false, true);
      deleteClickHandler({ isTrusted: true });
      expect(dom.window.document.getElementById("favlock-highlight-controls")).toBeNull();
      expect(dom.window.document.querySelector("mark")?.textContent).toBeUndefined();

      deleteRequests[1]({ ok: false, error: "Network unavailable" });
      await vi.waitFor(() => {
        expect(dom.window.document.querySelector("mark")?.textContent).toBe("saved passage");
        expect(dom.window.document.getElementById("favlock-highlight-controls")).not.toBeNull();
      });

      const colorRequests = [];
      const sendColorMessage = vi.fn(() => new Promise((resolve) => {
        colorRequests.push(resolve);
      }));
      globalThis.chrome.runtime.sendMessage = sendColorMessage;
      colorButtonClickHandler({ isTrusted: true });
      pinkSwatchClickHandler({ isTrusted: true });
      expect(dom.window.document.querySelector("mark")?.getAttribute("data-favlock-highlight"))
        .toBe("pink");
      expect(sendColorMessage).toHaveBeenCalledWith({
        type: "favlock.highlight.color",
        highlightId: "00000000-0000-4000-8000-000000000003",
        color: "pink",
      });

      colorRequests[0]({ ok: false, error: "Network unavailable" });
      await vi.waitFor(() => {
        expect(dom.window.document.querySelector("mark")?.getAttribute("data-favlock-highlight"))
          .toBe("blue");
      });
    } finally {
      window.__favlockHighlightControlsCleanup?.();
      dom.window.Element.prototype.attachShadow = originalAttachShadow;
      dom.window.EventTarget.prototype.addEventListener = originalAddEventListener;
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.MutationObserver = previousMutationObserver;
      globalThis.chrome = previousChrome;
      dom.window.close();
    }
  });

});
