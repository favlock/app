export const ENTRY_TITLE_MAX_LENGTH = 120;
export const ENTRY_CONTENT_MAX_LENGTH = 10_000;

const ALLOWED_ENTRY_TAGS = new Set([
  "B",
  "BLOCKQUOTE",
  "BR",
  "DIV",
  "EM",
  "I",
  "INPUT",
  "LI",
  "OL",
  "P",
  "S",
  "STRIKE",
  "STRONG",
  "U",
  "UL",
]);
const REMOVED_WITH_CONTENT_TAGS = new Set([
  "IFRAME",
  "OBJECT",
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
]);

function sanitizeNode(node: Node, outputDocument: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return outputDocument.createTextNode(node.textContent ?? "");
  }

  if (!(node instanceof Element)) return null;
  if (REMOVED_WITH_CONTENT_TAGS.has(node.tagName)) return null;

  if (node.tagName === "INPUT") {
    if (node.getAttribute("type")?.toLowerCase() !== "checkbox") return null;

    const checkbox = outputDocument.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    if ((node as HTMLInputElement).checked || node.hasAttribute("checked")) {
      checkbox.setAttribute("checked", "");
    }
    return checkbox;
  }

  const fragment = outputDocument.createDocumentFragment();
  for (const child of Array.from(node.childNodes)) {
    const cleanChild = sanitizeNode(child, outputDocument);
    if (cleanChild) fragment.append(cleanChild);
  }

  if (!ALLOWED_ENTRY_TAGS.has(node.tagName)) return fragment;

  const cleanElement = outputDocument.createElement(node.tagName.toLowerCase());
  if (node.tagName === "UL" && node.getAttribute("data-checklist") === "true") {
    cleanElement.setAttribute("data-checklist", "true");
  }
  cleanElement.append(fragment);
  return cleanElement;
}

export function sanitizeEntryHtml(html: string): string {
  if (typeof DOMParser === "undefined") return "";

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const output = document.implementation.createHTMLDocument("");
  const container = output.createElement("div");

  for (const child of Array.from(parsed.body.childNodes)) {
    const cleanChild = sanitizeNode(child, output);
    if (cleanChild) container.append(cleanChild);
  }

  return container.innerHTML;
}

export function getEntryText(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]*>/g, "");
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.body.textContent ?? "";
}

export function getEntryTextLength(html: string): number {
  return Array.from(getEntryText(html)).length;
}
