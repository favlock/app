export const READSPACE_CONTENT_VERSION = 5;
export const READSPACE_TITLE_MAX_LENGTH = 120;
export const READSPACE_HTML_MAX_BYTES = 150_000;
export const READSPACE_SOURCE_URL_MAX_LENGTH = 5_000;
export const READSPACE_SERIALIZED_MAX_BYTES = 180_000;

const ALLOWED_READSPACE_TAGS = new Set([
  "A",
  "B",
  "BR",
  "CODE",
  "DEL",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "I",
  "LI",
  "MARK",
  "OL",
  "P",
  "S",
  "STRONG",
  "SUB",
  "SUP",
  "U",
  "UL",
]);
const REMOVED_READSPACE_TAGS = new Set([
  "IFRAME",
  "OBJECT",
  "SCRIPT",
  "STYLE",
  "SVG",
  "TEMPLATE",
]);

export type ReaderReference = {
  title: string;
  siteName: string;
  byline: string;
  publishedAt: string;
  updatedAt: string;
  sourceUrl: string;
  html: string;
  capturedAt: string;
};

export type ReadspaceContent = ReaderReference & {
  version: typeof READSPACE_CONTENT_VERSION;
};

function safeHttpUrl(input: string): string {
  if (input.length > READSPACE_SOURCE_URL_MAX_LENGTH) return "";
  try {
    const value = new URL(input);
    return value.protocol === "http:" || value.protocol === "https:"
      ? value.href
      : "";
  } catch {
    return "";
  }
}

function sanitizeReadspaceNode(node: Node, output: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return output.createTextNode((node.textContent ?? "").replace(/\s+/g, " "));
  }
  if (!(node instanceof Element) || REMOVED_READSPACE_TAGS.has(node.tagName)) {
    return null;
  }

  const fragment = output.createDocumentFragment();
  for (const child of Array.from(node.childNodes)) {
    const cleanChild = sanitizeReadspaceNode(child, output);
    if (cleanChild) fragment.append(cleanChild);
  }
  if (!ALLOWED_READSPACE_TAGS.has(node.tagName)) return fragment;

  if (node.tagName === "A") {
    const href = safeHttpUrl(node.getAttribute("href") ?? "");
    if (!href) return fragment;
    const link = output.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.append(fragment);
    return link;
  }

  const clean = output.createElement(node.tagName.toLowerCase());
  clean.append(fragment);
  return clean;
}

export function sanitizeReadspaceHtml(value: string): string {
  if (!value || typeof DOMParser === "undefined") return "";
  const parsed = new DOMParser().parseFromString(value, "text/html");
  const output = document.implementation.createHTMLDocument("");
  const container = output.createElement("article");
  for (const child of Array.from(parsed.body.childNodes)) {
    const cleanChild = sanitizeReadspaceNode(child, output);
    if (cleanChild) container.append(cleanChild);
  }
  while (
    new TextEncoder().encode(container.innerHTML).byteLength >
      READSPACE_HTML_MAX_BYTES &&
    container.lastChild
  ) {
    container.lastChild.remove();
  }
  return container.innerHTML;
}

export function normalizeReaderReference(value: unknown): ReaderReference | null {
  if (!value || typeof value !== "object") return null;
  const capture = value as Record<string, unknown>;
  const sourceUrl = safeHttpUrl(
    typeof capture.sourceUrl === "string" ? capture.sourceUrl : "",
  );
  const title = typeof capture.title === "string" ? capture.title.trim() : "";
  if (!sourceUrl || !title) return null;

  const clipped = (key: string, maximum: number) =>
    typeof capture[key] === "string"
      ? capture[key].trim().slice(0, maximum)
      : "";

  const isoDate = (key: string) => {
    if (typeof capture[key] !== "string" || !capture[key]) return "";
    const date = new Date(capture[key]);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  };

  return {
    title: title.slice(0, READSPACE_TITLE_MAX_LENGTH),
    siteName: clipped("siteName", 200),
    byline: clipped("byline", 300),
    publishedAt: isoDate("publishedAt"),
    updatedAt: isoDate("updatedAt"),
    sourceUrl,
    html:
      typeof capture.html === "string"
        ? sanitizeReadspaceHtml(capture.html)
        : "",
    capturedAt:
      typeof capture.capturedAt === "string"
        ? capture.capturedAt
        : new Date().toISOString(),
  };
}

export function serializeReadspaceContent(reference: ReaderReference): string {
  const payload = {
    version: READSPACE_CONTENT_VERSION,
    ...reference,
    html: sanitizeReadspaceHtml(reference.html),
  };
  let serialized = JSON.stringify(payload);
  if (
    new TextEncoder().encode(serialized).byteLength <=
      READSPACE_SERIALIZED_MAX_BYTES ||
    typeof DOMParser === "undefined"
  ) {
    return serialized;
  }

  const parsed = new DOMParser().parseFromString(payload.html, "text/html");
  while (
    new TextEncoder().encode(serialized).byteLength >
      READSPACE_SERIALIZED_MAX_BYTES &&
    parsed.body.lastChild
  ) {
    parsed.body.lastChild.remove();
    payload.html = parsed.body.innerHTML;
    serialized = JSON.stringify(payload);
  }
  return serialized;
}

export function parseReadspaceContent(value: string): ReadspaceContent | null {
  try {
    const normalized = normalizeReaderReference(JSON.parse(value));
    return normalized
      ? { version: READSPACE_CONTENT_VERSION, ...normalized }
      : null;
  } catch {
    return null;
  }
}
