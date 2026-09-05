export function captureCurrentSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const exact = range.toString().replace(/\s+/g, " ").trim();
  if (!exact || exact.length > 10_000 || !document.body.contains(range.commonAncestorContainer)) return null;

  const pathFor = (node) => {
    const indexes = [];
    let current = node;
    while (current && current !== document.body) {
      const parent = current.parentNode;
      if (!parent) return "";
      indexes.push(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return current === document.body ? indexes.reverse().join("/") : "";
  };

  const before = document.createRange();
  before.selectNodeContents(document.body);
  before.setEnd(range.startContainer, range.startOffset);
  const rawPrefix = before.toString();
  const after = document.createRange();
  after.selectNodeContents(document.body);
  after.setStart(range.endContainer, range.endOffset);
  const rawSuffix = after.toString();
  const start = rawPrefix.length;

  return {
    version: 1,
    quote: {
      exact,
      prefix: rawPrefix.replace(/\s+/g, " ").slice(-128),
      suffix: rawSuffix.replace(/\s+/g, " ").slice(0, 128),
    },
    position: { start, end: start + range.toString().length },
    dom: {
      startPath: pathFor(range.startContainer),
      startOffset: range.startOffset,
      endPath: pathFor(range.endContainer),
      endOffset: range.endOffset,
    },
    color: "yellow",
    note: "",
    capturedAt: new Date().toISOString(),
  };
}

export function showHighlightNotice(message, tone = "success") {
  const existing = document.getElementById("favlock-highlight-feedback");
  existing?.remove();
  const feedback = document.createElement("div");
  feedback.id = "favlock-highlight-feedback";
  const palette = tone === "warning"
    ? { border: "#b45309", background: "#fffbeb", color: "#92400e" }
    : tone === "error"
    ? { border: "#b91c1c", background: "#fff1f2", color: "#991b1b" }
    : { border: "#0b5d57", background: "#eef8f4", color: "#123f3a" };
  feedback.setAttribute("role", tone === "error" ? "alert" : "status");
  feedback.textContent = String(message).slice(0, 160);
  Object.assign(feedback.style, {
    position: "fixed",
    zIndex: "2147483647",
    right: "20px",
    bottom: "20px",
    maxWidth: "min(360px, calc(100vw - 40px))",
    padding: "12px 15px",
    borderRadius: "10px",
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.18)",
    font: "600 14px/1.4 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  });
  document.documentElement.append(feedback);
  window.setTimeout(() => feedback.remove(), 4000);
}

export function readSettledHighlightRenderResult(delayMs = 750) {
  const delay = Number.isFinite(delayMs)
    ? Math.min(Math.max(delayMs, 0), 2_000)
    : 750;
  return new Promise((resolve) => {
    window.setTimeout(
      () => resolve(window.__favlockHighlightRenderResult || null),
      delay,
    );
  });
}

export function renderSavedHighlights(
  highlights,
  append = false,
  canAnnotate = false,
  replaceHighlightId = "",
) {
  const markerAttribute = "data-favlock-highlight";
  const styleId = "favlock-highlight-styles";
  const controlsId = "favlock-highlight-controls";
  const highlightNames = ["yellow", "green", "blue", "pink"].map(
    (color) => `favlock-${color}`,
  );
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const isPersistedHighlightId = (value) => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(value || ""))
  );

  const incomingHighlights = (Array.isArray(highlights) ? highlights : []).map(
    (highlight) => highlight?.payload
      ? { id: String(highlight.id || ""), payload: highlight.payload }
      : { id: "", payload: highlight },
  );
  const existingHighlights = (window.__favlockHighlights || []).filter(
    (highlight) => highlight.id !== replaceHighlightId,
  );
  const renderHighlights = append
    ? [...existingHighlights, ...incomingHighlights]
    : incomingHighlights;
  window.__favlockHighlights = renderHighlights;
  window.__favlockCanAnnotate = Boolean(canAnnotate);
  window.__favlockPendingHighlightColors ||= new Set();

  window.__favlockHighlightObserver?.disconnect();
  window.__favlockHighlightControlsCleanup?.();
  window.__favlockHighlightControlsCleanup = undefined;
  window.clearTimeout(window.__favlockHighlightObserverTimer);
  window.clearTimeout(window.__favlockHighlightObserverExpiry);
  for (const name of highlightNames) window.CSS?.highlights?.delete(name);
  document.getElementById(controlsId)?.remove();
  for (const mark of document.querySelectorAll(`mark[${markerAttribute}]`)) {
    const parent = mark.parentNode;
    mark.replaceWith(...mark.childNodes);
    parent?.normalize();
  }

  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      ::highlight(favlock-yellow), mark[${markerAttribute}="yellow"] { background-color: #fde68a; color: inherit; }
      ::highlight(favlock-green), mark[${markerAttribute}="green"] { background-color: #bbf7d0; color: inherit; }
      ::highlight(favlock-blue), mark[${markerAttribute}="blue"] { background-color: #bfdbfe; color: inherit; }
      ::highlight(favlock-pink), mark[${markerAttribute}="pink"] { background-color: #fbcfe8; color: inherit; }
    `;
    document.documentElement.append(style);
  }

  const resolvePath = (path) => {
    let current = document.body;
    if (path === "") return current;
    for (const part of String(path).split("/")) {
      const index = Number(part);
      if (!Number.isSafeInteger(index) || index < 0) return null;
      current = current?.childNodes?.[index] || null;
      if (!current) return null;
    }
    return current;
  };

  const rangeFromDom = (payload) => {
    const anchor = payload?.dom;
    if (!anchor) return null;
    try {
      const startNode = resolvePath(anchor.startPath);
      const endNode = resolvePath(anchor.endPath);
      if (!startNode || !endNode) return null;
      const range = document.createRange();
      range.setStart(startNode, anchor.startOffset);
      range.setEnd(endNode, anchor.endOffset);
      return normalize(range.toString()) === normalize(payload.quote?.exact)
        ? range
        : null;
    } catch {
      return null;
    }
  };

  const textPointAt = (offset) => {
    if (!Number.isSafeInteger(offset) || offset < 0) return null;
    const walker = document.createTreeWalker(
      document.body,
      window.NodeFilter.SHOW_TEXT,
    );
    let consumed = 0;
    let node;
    while ((node = walker.nextNode())) {
      const next = consumed + node.data.length;
      if (offset <= next) return { node, offset: offset - consumed };
      consumed = next;
    }
    return null;
  };

  const rangeFromPosition = (payload) => {
    const anchor = payload?.position;
    if (
      !anchor
      || !Number.isSafeInteger(anchor.start)
      || !Number.isSafeInteger(anchor.end)
      || anchor.start < 0
      || anchor.end < anchor.start
    ) return null;
    try {
      const start = textPointAt(anchor.start);
      const end = textPointAt(anchor.end);
      if (!start || !end) return null;
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return normalize(range.toString()) === normalize(payload.quote?.exact)
        ? range
        : null;
    } catch {
      return null;
    }
  };

  const buildTextIndex = () => {
    const walker = document.createTreeWalker(
      document.body,
      window.NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest("script, style, noscript, textarea")) {
            return window.NodeFilter.FILTER_REJECT;
          }
          return window.NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    const starts = [];
    const ends = [];
    const nodeOrder = new Map();
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
      nodeOrder.set(node, nodeOrder.size);
      for (let offset = 0; offset < node.data.length; offset += 1) {
        const character = node.data[offset];
        if (/\s/.test(character)) {
          if (text && !text.endsWith(" ")) {
            text += " ";
            starts.push({ node, offset });
            ends.push({ node, offset: offset + 1 });
          } else if (text.endsWith(" ")) {
            ends[ends.length - 1] = { node, offset: offset + 1 };
          }
        } else {
          text += character;
          starts.push({ node, offset });
          ends.push({ node, offset: offset + 1 });
        }
      }
    }
    if (text.endsWith(" ")) {
      text = text.slice(0, -1);
      starts.pop();
      ends.pop();
    }
    return { text, starts, ends, nodeOrder };
  };

  const textIndex = buildTextIndex();
  const rangeFromQuote = (payload) => {
    const exact = normalize(payload?.quote?.exact);
    if (!exact) return null;
    const prefix = normalize(payload?.quote?.prefix);
    const suffix = normalize(payload?.quote?.suffix);
    let bestIndex = -1;
    let bestScore = -1;
    let index = textIndex.text.indexOf(exact);
    while (index !== -1) {
      const before = textIndex.text.slice(0, index);
      const after = textIndex.text.slice(index + exact.length);
      const score = (prefix && before.endsWith(prefix) ? 1 : 0)
        + (suffix && after.startsWith(suffix) ? 1 : 0);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
      index = textIndex.text.indexOf(exact, index + 1);
    }
    if (bestIndex < 0) return null;
    const start = textIndex.starts[bestIndex];
    const end = textIndex.ends[bestIndex + exact.length - 1];
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  };

  const rangesByColor = new Map(highlightNames.map((name) => [name, []]));
  for (const highlight of renderHighlights) {
    const payload = highlight.payload;
    const range = rangeFromDom(payload)
      || rangeFromPosition(payload)
      || rangeFromQuote(payload);
    if (!range || range.collapsed) continue;
    const color = ["yellow", "green", "blue", "pink"].includes(payload?.color)
      ? payload.color
      : "yellow";
    rangesByColor.get(`favlock-${color}`).push({
      id: highlight.id,
      payload,
      range,
    });
  }

  const supportsCustomHighlights = Boolean(
    window.CSS?.highlights && typeof window.Highlight === "function",
  );
  if (supportsCustomHighlights) {
    for (const [name, highlightsForColor] of rangesByColor) {
      if (highlightsForColor.length) {
        window.CSS.highlights.set(
          name,
          new window.Highlight(...highlightsForColor.map(({ range }) => range)),
        );
      }
    }
  } else {
    const segments = [];
    for (const [name, highlightsForColor] of rangesByColor) {
      for (const { range } of highlightsForColor) {
        const walker = document.createTreeWalker(
          range.commonAncestorContainer,
          window.NodeFilter.SHOW_TEXT,
        );
        const nodes = range.commonAncestorContainer.nodeType === window.Node.TEXT_NODE
          ? [range.commonAncestorContainer]
          : [];
        let node;
        while ((node = walker.nextNode())) nodes.push(node);
        for (const textNode of nodes) {
          if (!range.intersectsNode(textNode)) continue;
          const start = textNode === range.startContainer ? range.startOffset : 0;
          const end = textNode === range.endContainer ? range.endOffset : textNode.data.length;
          if (end > start) segments.push({ textNode, start, end, color: name.slice(8) });
        }
      }
    }
    segments.sort((left, right) => {
      if (left.textNode === right.textNode) return right.start - left.start;
      return (textIndex.nodeOrder.get(right.textNode) || 0)
        - (textIndex.nodeOrder.get(left.textNode) || 0);
    });
    for (const segment of segments) {
      try {
        const range = document.createRange();
        range.setStart(segment.textNode, segment.start);
        range.setEnd(segment.textNode, segment.end);
        const mark = document.createElement("mark");
        mark.setAttribute(markerAttribute, segment.color);
        range.surroundContents(mark);
      } catch {
        // The page changed between matching and rendering.
      }
    }
  }

  const matched = [...rangesByColor.values()].reduce(
    (total, highlightsForColor) => total + highlightsForColor.length,
    0,
  );

  let controls = 0;
  const removableHighlights = [...rangesByColor.values()]
    .flat()
    .filter(({ id }) => isPersistedHighlightId(id));
  if (removableHighlights.length) {
    const host = document.createElement("div");
    host.id = controlsId;
    Object.assign(host.style, {
      all: "initial",
      position: "absolute",
      inset: "0 auto auto 0",
      width: "0",
      height: "0",
      overflow: "visible",
      zIndex: "2147483646",
      pointerEvents: "none",
    });
    const shadow = host.attachShadow({ mode: "closed" });
    const controlStyle = document.createElement("style");
    controlStyle.textContent = `
      .control {
        position: absolute;
        display: flex;
        gap: 2px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 100ms ease;
      }
      .control[data-visible="true"], .control:focus-within {
        opacity: 1;
        pointer-events: auto;
      }
      button {
        width: 18px;
        height: 18px;
        padding: 0;
        border: 1px solid rgba(15, 23, 42, 0.18);
        border-radius: 999px;
        background: #ffffff;
        color: #475569;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
        cursor: pointer;
        font: 600 14px/15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      button:hover, button:focus-visible { background: #ecfdf5; color: #0f766e; }
      button.remove:hover, button.remove:focus-visible { background: #fff1f2; color: #be123c; }
      button:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
      button:disabled { cursor: wait; opacity: 0.55; }
      button.color { background: var(--highlight-color); }
      .palette {
        position: absolute;
        top: 23px;
        right: 0;
        display: flex;
        gap: 6px;
        padding: 7px;
        border: 1px solid rgba(15, 23, 42, 0.16);
        border-radius: 999px;
        background: #ffffff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
      }
      .palette button { box-shadow: none; }
      .palette button[aria-pressed="true"] { outline: 2px solid #0f172a; outline-offset: 2px; }
      .editor {
        position: absolute;
        top: 23px;
        right: 0;
        width: min(280px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: 10px;
        border: 1px solid rgba(15, 23, 42, 0.16);
        border-radius: 10px;
        background: #ffffff;
        color: #0f172a;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      textarea {
        display: block;
        width: 100%;
        min-height: 86px;
        box-sizing: border-box;
        resize: vertical;
        padding: 8px;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        color: #0f172a;
        background: #ffffff;
        font: inherit;
      }
      textarea:focus { outline: 2px solid #0f766e; outline-offset: 1px; }
      .actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
      .actions button { width: auto; height: 28px; padding: 0 9px; border-radius: 7px; font-size: 12px; }
      .error { margin: 6px 0 0; color: #b91c1c; font-size: 12px; }
      @media (prefers-reduced-motion: reduce) {
        .control { transition: none; }
      }
    `;
    shadow.append(controlStyle);
    const hoverTargets = [];
    for (const { id, payload, range } of removableHighlights) {
      const rectangles = typeof range.getClientRects === "function"
        ? [...range.getClientRects()]
        : [];
      const rectangle = rectangles.at(-1)
        || (typeof range.getBoundingClientRect === "function"
          ? range.getBoundingClientRect()
          : null);
      if (!rectangle) continue;
      const control = document.createElement("span");
      control.className = "control";
      control.style.left = `${Math.min(
        window.scrollX + window.innerWidth - (canAnnotate ? 62 : 42),
        window.scrollX + rectangle.right + 3,
      )}px`;
      control.style.top = `${Math.max(0, window.scrollY + rectangle.top - 3)}px`;
      control.dataset.visible = "false";

      const colors = {
        yellow: "#fde68a",
        green: "#bbf7d0",
        blue: "#bfdbfe",
        pink: "#fbcfe8",
      };
      const colorButton = document.createElement("button");
      colorButton.type = "button";
      colorButton.className = "color";
      colorButton.style.setProperty(
        "--highlight-color",
        colors[payload?.color] || colors.yellow,
      );
      colorButton.title = "Change FavLock highlight color";
      colorButton.setAttribute("aria-label", colorButton.title);
      colorButton.setAttribute("aria-expanded", "false");
      colorButton.disabled = window.__favlockPendingHighlightColors.has(id);
      colorButton.addEventListener("click", (event) => {
        if (!event.isTrusted || colorButton.disabled) return;
        const existingPalette = control.querySelector(".palette");
        if (existingPalette) {
          existingPalette.remove();
          colorButton.setAttribute("aria-expanded", "false");
          return;
        }
        shadow.querySelectorAll(".palette, .editor").forEach((popover) => popover.remove());
        shadow.querySelectorAll('button.color[aria-expanded="true"]').forEach(
          (button) => button.setAttribute("aria-expanded", "false"),
        );
        const palette = document.createElement("span");
        palette.className = "palette";
        palette.setAttribute("role", "group");
        palette.setAttribute("aria-label", "Highlight color");
        for (const [color, colorValue] of Object.entries(colors)) {
          const swatch = document.createElement("button");
          swatch.type = "button";
          swatch.className = "color";
          swatch.style.setProperty("--highlight-color", colorValue);
          swatch.title = `${color[0].toUpperCase()}${color.slice(1)} highlight`;
          swatch.setAttribute("aria-label", swatch.title);
          swatch.setAttribute("aria-pressed", String(payload?.color === color));
          swatch.addEventListener("click", (swatchEvent) => {
            if (!swatchEvent.isTrusted || swatch.disabled || payload?.color === color) return;
            const previousColor = payload.color;
            window.__favlockPendingHighlightColors.add(id);
            let colorRequest;
            try {
              colorRequest = globalThis.chrome?.runtime?.sendMessage({
                type: "favlock.highlight.color",
                highlightId: id,
                color,
              });
            } catch (colorError) {
              colorRequest = Promise.reject(colorError);
            }
            payload.color = color;
            renderSavedHighlights(window.__favlockHighlights, false, canAnnotate);
            Promise.resolve(colorRequest)
              .then((response) => {
                if (!response?.ok) throw new Error(response?.error || "Could not update the highlight color.");
                window.__favlockPendingHighlightColors.delete(id);
                payload.color = response.color || color;
                renderSavedHighlights(window.__favlockHighlights, false, canAnnotate);
              })
              .catch(() => {
                window.__favlockPendingHighlightColors.delete(id);
                payload.color = previousColor;
                renderSavedHighlights(window.__favlockHighlights, false, canAnnotate);
              });
          });
          palette.append(swatch);
        }
        control.append(palette);
        colorButton.setAttribute("aria-expanded", "true");
      });
      control.append(colorButton);

      if (canAnnotate) {
        const annotate = document.createElement("button");
        annotate.type = "button";
        annotate.textContent = "✎";
        annotate.title = payload?.note ? "Edit FavLock annotation" : "Add FavLock annotation";
        annotate.setAttribute("aria-label", annotate.title);
        annotate.addEventListener("click", (event) => {
          if (!event.isTrusted || annotate.disabled) return;
          const existingEditor = control.querySelector(".editor");
          if (existingEditor) {
            existingEditor.remove();
            return;
          }
          shadow.querySelectorAll(".editor, .palette").forEach((popover) => popover.remove());
          shadow.querySelectorAll('button.color[aria-expanded="true"]').forEach(
            (button) => button.setAttribute("aria-expanded", "false"),
          );
          const editor = document.createElement("form");
          editor.className = "editor";
          const textarea = document.createElement("textarea");
          textarea.maxLength = 10_000;
          textarea.value = String(payload?.note || "");
          textarea.placeholder = "Add a private annotation…";
          textarea.setAttribute("aria-label", "Private annotation");
          const error = document.createElement("p");
          error.className = "error";
          error.setAttribute("role", "alert");
          error.hidden = true;
          const actions = document.createElement("div");
          actions.className = "actions";
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.textContent = "Cancel";
          const save = document.createElement("button");
          save.type = "submit";
          save.textContent = "Save";
          cancel.addEventListener("click", () => editor.remove());
          editor.addEventListener("submit", (submitEvent) => {
            submitEvent.preventDefault();
            if (!submitEvent.isTrusted || save.disabled) return;
            save.disabled = true;
            cancel.disabled = true;
            error.hidden = true;
            Promise.resolve(globalThis.chrome?.runtime?.sendMessage({
              type: "favlock.highlight.annotate",
              highlightId: id,
              note: textarea.value,
            }))
              .then((response) => {
                if (!response?.ok) throw new Error(response?.error || "Could not save the annotation.");
                payload.note = String(response.note || "");
                annotate.title = payload.note ? "Edit FavLock annotation" : "Add FavLock annotation";
                annotate.setAttribute("aria-label", annotate.title);
                editor.remove();
              })
              .catch((saveError) => {
                save.disabled = false;
                cancel.disabled = false;
                error.textContent = saveError instanceof Error ? saveError.message : "Could not save the annotation.";
                error.hidden = false;
              });
          });
          actions.append(cancel, save);
          editor.append(textarea, actions, error);
          control.append(editor);
          textarea.focus();
        });
        control.append(annotate);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "×";
      remove.title = "Remove FavLock highlight";
      remove.setAttribute("aria-label", "Remove FavLock highlight");
      remove.addEventListener("click", (event) => {
        if (!event.isTrusted || remove.disabled) return;
        remove.disabled = true;
        const beforeDelete = [...(window.__favlockHighlights || [])];
        const deletedIndex = beforeDelete.findIndex((highlight) => highlight.id === id);
        const deletedHighlight = beforeDelete[deletedIndex];
        let deleteRequest;
        try {
          deleteRequest = globalThis.chrome?.runtime?.sendMessage({
            type: "favlock.highlight.delete",
            highlightId: id,
          });
        } catch (deleteError) {
          deleteRequest = Promise.reject(deleteError);
        }
        renderSavedHighlights(
          beforeDelete.filter((highlight) => highlight.id !== id),
          false,
          canAnnotate,
        );
        Promise.resolve(deleteRequest)
          .then((response) => {
            if (!response?.ok) {
              throw new Error(response?.error || "Could not remove the highlight.");
            }
          })
          .catch(() => {
            const currentHighlights = [...(window.__favlockHighlights || [])];
            if (
              deletedHighlight
              && !currentHighlights.some((highlight) => highlight.id === id)
            ) {
              currentHighlights.splice(
                Math.min(Math.max(deletedIndex, 0), currentHighlights.length),
                0,
                deletedHighlight,
              );
              renderSavedHighlights(currentHighlights, false, canAnnotate);
            }
          });
      });
      control.append(remove);
      shadow.append(control);
      hoverTargets.push({ control, range });
      controls += 1;
    }
    if (controls) {
      document.documentElement.append(host);
      const containsPoint = (rectangle, x, y, padding = 0) => (
        x >= rectangle.left - padding
        && x <= rectangle.right + padding
        && y >= rectangle.top - padding
        && y <= rectangle.bottom + padding
      );
      const hasOpenPopover = (control) => Boolean(
        control.querySelector(".palette, .editor") || control.matches(":focus-within"),
      );
      const updateHoveredControl = (event) => {
        let hoveredControl = null;
        for (const target of hoverTargets) {
          const textRectangles = typeof target.range.getClientRects === "function"
            ? [...target.range.getClientRects()]
            : [];
          const controlRectangle = target.control.getBoundingClientRect();
          const overText = textRectangles.some(
            (textRectangle) => containsPoint(textRectangle, event.clientX, event.clientY, 3),
          );
          const lastTextRectangle = textRectangles.at(-1);
          const bridgeRectangle = lastTextRectangle && {
            left: Math.min(lastTextRectangle.right, controlRectangle.left) - 4,
            right: Math.max(lastTextRectangle.right, controlRectangle.right) + 4,
            top: Math.min(lastTextRectangle.top, controlRectangle.top) - 4,
            bottom: Math.max(lastTextRectangle.bottom, controlRectangle.bottom) + 4,
          };
          if (
            overText
            || containsPoint(controlRectangle, event.clientX, event.clientY, 4)
            || (bridgeRectangle && containsPoint(bridgeRectangle, event.clientX, event.clientY))
          ) {
            hoveredControl = target.control;
            break;
          }
        }
        for (const { control } of hoverTargets) {
          control.dataset.visible = String(
            control === hoveredControl || hasOpenPopover(control),
          );
        }
      };
      const hideIdleControls = () => {
        for (const { control } of hoverTargets) {
          if (!hasOpenPopover(control)) control.dataset.visible = "false";
        }
      };
      document.addEventListener("mousemove", updateHoveredControl, true);
      document.addEventListener("mouseleave", hideIdleControls, true);
      window.__favlockHighlightControlsCleanup = () => {
        document.removeEventListener("mousemove", updateHoveredControl, true);
        document.removeEventListener("mouseleave", hideIdleControls, true);
      };
    }
  }

  if (supportsCustomHighlights && renderHighlights.length) {
    const observer = new MutationObserver(() => {
      window.clearTimeout(window.__favlockHighlightObserverTimer);
      window.__favlockHighlightObserverTimer = window.setTimeout(
        () => renderSavedHighlights(renderHighlights, false, canAnnotate),
        250,
      );
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__favlockHighlightObserver = observer;
    window.__favlockHighlightObserverExpiry = window.setTimeout(
      () => observer.disconnect(),
      15_000,
    );
  }
  const result = { matched, total: renderHighlights.length, controls };
  window.__favlockHighlightRenderResult = result;
  return result;
}
