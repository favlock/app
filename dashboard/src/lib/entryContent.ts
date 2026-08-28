export const ENTRY_TITLE_MAX_LENGTH = 120;
export const ENTRY_CONTENT_MAX_LENGTH = 10_000;

const ALLOWED_ENTRY_TAGS = new Set([
  "A",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "CODE",
  "PRE",
  "MARK",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
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
  "SVG",
  "MATH",
  "NOSCRIPT",
  "VIDEO",
  "AUDIO",
]);

export function safeEntryLink(value: string): string | null {
  const href = value.trim();
  if (
    Array.from(href).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  try {
    const url = new URL(href);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

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

  // Convert common Word/Google Docs inline styles to semantic formatting.
  // Never carry arbitrary styles, classes, remote resources, or event handlers.
  const style = node instanceof HTMLElement ? node.style : null;
  const wrappers: string[] = [];
  if (style?.fontWeight === "bold" || Number(style?.fontWeight) >= 600)
    wrappers.push("strong");
  if (style?.fontStyle === "italic") wrappers.push("em");
  if (
    style?.textDecoration.includes("underline") ||
    style?.textDecorationLine.includes("underline")
  )
    wrappers.push("u");
  if (
    style?.textDecoration.includes("line-through") ||
    style?.textDecorationLine.includes("line-through")
  )
    wrappers.push("s");
  if (
    style?.backgroundColor &&
    !["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor)
  )
    wrappers.push("mark");
  if (
    !node.closest("pre") &&
    !["TABLE", "TR", "TD", "TH", "UL", "OL"].includes(node.tagName)
  ) {
    for (const tag of wrappers) {
      if (node.tagName.toLowerCase() === tag) continue;
      const wrapper = outputDocument.createElement(tag);
      wrapper.append(...Array.from(fragment.childNodes));
      fragment.append(wrapper);
    }
  }

  if (!ALLOWED_ENTRY_TAGS.has(node.tagName)) return fragment;
  const href =
    node.tagName === "A"
      ? safeEntryLink(node.getAttribute("href") ?? "")
      : null;
  if (node.tagName === "A" && !href) return fragment;

  const cleanElement = outputDocument.createElement(node.tagName.toLowerCase());
  if (
    node.tagName === "UL" &&
    (node.getAttribute("data-checklist") === "true" ||
      node.getAttribute("data-type") === "taskList")
  ) {
    cleanElement.setAttribute("data-checklist", "true");
  }
  if (href) {
    cleanElement.setAttribute("href", href);
    cleanElement.setAttribute("rel", "noopener noreferrer");
  }
  const numericAttributes =
    node.tagName === "OL"
      ? ["start"]
      : ["TD", "TH"].includes(node.tagName)
        ? ["colspan", "rowspan"]
        : [];
  for (const attribute of numericAttributes) {
    const value = Number(node.getAttribute(attribute));
    if (Number.isInteger(value) && value > 0 && value <= 1000)
      cleanElement.setAttribute(attribute, String(value));
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

/** Clipboard text retains paragraph, list and table boundaries. */
export function getEntryPlainText(html: string): string {
  const parsed = new DOMParser().parseFromString(
    sanitizeEntryHtml(html),
    "text/html",
  );
  for (const checkbox of parsed.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )) {
    checkbox.replaceWith(checkbox.checked ? "[x] " : "[ ] ");
  }
  for (const br of parsed.querySelectorAll("br")) br.replaceWith("\n");
  for (const cell of parsed.querySelectorAll("td, th")) cell.append("\t");
  for (const block of parsed.querySelectorAll(
    "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr",
  ))
    block.append("\n");
  return (parsed.body.textContent ?? "")
    .replace(/\t\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
