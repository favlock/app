import {
  WEB_HIGHLIGHT_QUOTE_MAX_LENGTH,
  WEB_HIGHLIGHT_VERSION,
  type WebHighlightPayload,
} from "./webHighlight";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

export type ArticleHighlightMenuPosition = {
  left: number;
  top: number;
  maxHeight: number;
  placement: "above" | "below";
};

export function getArticleHighlightMenuPosition({
  anchorX,
  anchorTop,
  anchorBottom,
  viewportWidth,
  viewportHeight,
}: {
  anchorX: number;
  anchorTop: number;
  anchorBottom: number;
  viewportWidth: number;
  viewportHeight: number;
}): ArticleHighlightMenuPosition {
  const viewportMargin = 12;
  const menuGap = 8;
  const menuWidth = Math.min(352, Math.max(0, viewportWidth - viewportMargin * 2));
  const halfMenuWidth = menuWidth / 2;
  const left = Math.min(
    viewportWidth - viewportMargin - halfMenuWidth,
    Math.max(viewportMargin + halfMenuWidth, anchorX),
  );
  const roomAbove = Math.max(0, anchorTop - menuGap - viewportMargin);
  const roomBelow = Math.max(0, viewportHeight - anchorBottom - menuGap - viewportMargin);
  const placement = roomAbove >= 56 || roomAbove >= roomBelow ? "above" : "below";

  return {
    left,
    top: placement === "above" ? anchorTop - menuGap : anchorBottom + menuGap,
    maxHeight: placement === "above" ? roomAbove : roomBelow,
    placement,
  };
}

function pathFor(root: HTMLElement, node: Node): string | null {
  const indexes: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: ParentNode | null = current.parentNode;
    if (!parent) return null;
    indexes.push(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === root ? indexes.reverse().join("/") : null;
}

export function captureArticleSelection(
  root: HTMLElement,
  selection: Selection | null = window.getSelection(),
): WebHighlightPayload | null {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const exact = normalize(range.toString());
  if (!exact || exact.length > WEB_HIGHLIGHT_QUOTE_MAX_LENGTH) return null;
  const startPath = pathFor(root, range.startContainer);
  const endPath = pathFor(root, range.endContainer);
  if (startPath === null || endPath === null) return null;

  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(root);
  after.setStart(range.endContainer, range.endOffset);
  const start = before.toString().length;

  return {
    version: WEB_HIGHLIGHT_VERSION,
    quote: {
      exact,
      prefix: normalize(before.toString()).slice(-128),
      suffix: normalize(after.toString()).slice(0, 128),
    },
    position: { start, end: start + range.toString().length },
    dom: {
      startPath,
      startOffset: range.startOffset,
      endPath,
      endOffset: range.endOffset,
    },
    color: "yellow",
    note: "",
    capturedAt: new Date().toISOString(),
  };
}

function resolvePath(root: HTMLElement, path: string): Node | null {
  let current: Node | null = root;
  if (!path) return current;
  for (const part of path.split("/")) {
    const index = Number(part);
    if (!Number.isSafeInteger(index) || index < 0) return null;
    current = current?.childNodes[index] ?? null;
    if (!current) return null;
  }
  return current;
}

function textPointAt(root: HTMLElement, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const next = consumed + textNode.data.length;
    if (offset <= next) return { node: textNode, offset: offset - consumed };
    consumed = next;
  }
  return null;
}

function rangeFromPayload(root: HTMLElement, payload: WebHighlightPayload): Range | null {
  if (payload.dom) {
    try {
      const start = resolvePath(root, payload.dom.startPath);
      const end = resolvePath(root, payload.dom.endPath);
      if (start && end) {
        const range = document.createRange();
        range.setStart(start, payload.dom.startOffset);
        range.setEnd(end, payload.dom.endOffset);
        if (normalize(range.toString()) === normalize(payload.quote.exact)) return range;
      }
    } catch {
      // Fall through to quote matching when the saved DOM path no longer fits.
    }
  }

  if (payload.position) {
    try {
      const start = textPointAt(root, payload.position.start);
      const end = textPointAt(root, payload.position.end);
      if (start && end) {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        if (normalize(range.toString()) === normalize(payload.quote.exact)) return range;
      }
    } catch {
      // Fall through to quote matching when saved text offsets no longer fit.
    }
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const starts: Array<{ node: Text; offset: number }> = [];
  const ends: Array<{ node: Text; offset: number }> = [];
  let text = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    for (let offset = 0; offset < textNode.data.length; offset += 1) {
      const character = textNode.data[offset];
      if (/\s/.test(character)) {
        if (text && !text.endsWith(" ")) {
          text += " ";
          starts.push({ node: textNode, offset });
          ends.push({ node: textNode, offset: offset + 1 });
        } else if (text.endsWith(" ")) {
          ends[ends.length - 1] = { node: textNode, offset: offset + 1 };
        }
      } else {
        text += character;
        starts.push({ node: textNode, offset });
        ends.push({ node: textNode, offset: offset + 1 });
      }
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }

  const exact = normalize(payload.quote.exact);
  let bestIndex = -1;
  let bestScore = -1;
  for (let index = text.indexOf(exact); index >= 0; index = text.indexOf(exact, index + 1)) {
    const before = text.slice(0, index);
    const after = text.slice(index + exact.length);
    const score = (payload.quote.prefix && before.endsWith(normalize(payload.quote.prefix)) ? 1 : 0)
      + (payload.quote.suffix && after.startsWith(normalize(payload.quote.suffix)) ? 1 : 0);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  if (bestIndex < 0) return null;
  const start = starts[bestIndex];
  const end = ends[bestIndex + exact.length - 1];
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

type HighlightRegistry = Map<string, { add: (...ranges: Range[]) => void }> & {
  set(name: string, highlight: unknown): void;
  delete(name: string): boolean;
};

const fallbackHighlightColors: Record<WebHighlightPayload["color"], string> = {
  yellow: "#fde68a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
};

function renderFallbackHighlights(
  root: HTMLElement,
  namespace: string,
  payloads: WebHighlightPayload[],
): () => void {
  for (const payload of payloads) {
    const range = rangeFromPayload(root, payload);
    if (!range || range.collapsed) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const segments: Array<{ node: Text; start: number; end: number }> = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      if (!range.intersectsNode(textNode)) continue;
      const start = textNode === range.startContainer ? range.startOffset : 0;
      const end = textNode === range.endContainer ? range.endOffset : textNode.data.length;
      if (end > start) segments.push({ node: textNode, start, end });
    }
    for (const segment of segments.reverse()) {
      let selectedNode = segment.node;
      if (segment.end < selectedNode.data.length) selectedNode.splitText(segment.end);
      if (segment.start > 0) selectedNode = selectedNode.splitText(segment.start);
      const marker = root.ownerDocument.createElement("mark");
      marker.dataset.favlockArticleHighlight = namespace;
      marker.style.backgroundColor = fallbackHighlightColors[payload.color];
      marker.style.color = "inherit";
      marker.style.borderRadius = "0.125rem";
      marker.style.padding = "0";
      selectedNode.parentNode?.insertBefore(marker, selectedNode);
      marker.append(selectedNode);
    }
  }

  return () => {
    const markers = root.querySelectorAll<HTMLElement>("mark[data-favlock-article-highlight]");
    for (const marker of markers) {
      if (marker.dataset.favlockArticleHighlight === namespace) {
        marker.replaceWith(...marker.childNodes);
      }
    }
    root.normalize();
  };
}

export function renderArticleHighlights(
  root: HTMLElement,
  namespace: string,
  payloads: WebHighlightPayload[],
): () => void {
  const css = typeof CSS === "undefined"
    ? undefined
    : CSS as typeof CSS & { highlights?: HighlightRegistry };
  const HighlightConstructor = (window as typeof window & {
    Highlight?: new (...ranges: Range[]) => unknown;
  }).Highlight;
  if (!css?.highlights || !HighlightConstructor) {
    return renderFallbackHighlights(root, namespace, payloads);
  }
  const names = ["yellow", "green", "blue", "pink"].map(
    (color) => `favlock-article-${namespace}-${color}`,
  );
  const grouped = new Map(names.map((name) => [name, [] as Range[]]));
  for (const payload of payloads) {
    const range = rangeFromPayload(root, payload);
    if (range && !range.collapsed) {
      grouped.get(`favlock-article-${namespace}-${payload.color}`)?.push(range);
    }
  }
  for (const [name, ranges] of grouped) {
    if (ranges.length) css.highlights.set(name, new HighlightConstructor(...ranges));
  }
  return () => names.forEach((name) => css.highlights?.delete(name));
}
