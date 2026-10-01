const TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "OL", "UL", "A", "B", "BR", "CODE", "DEL", "EM", "I", "MARK", "S", "STRONG", "SUB", "SUP", "U"]);
const BLOCKED = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE", "FORM"]);

export function renderArticleContent(container, html) {
  if (typeof html !== "string" || html.length > 150_000) throw new Error("Invalid article content.");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const output = container.ownerDocument;
  function copy(node, depth = 0) {
    if (depth > 100) return null;
    if (node.nodeType === 3) return output.createTextNode(node.textContent || "");
    if (node.nodeType !== 1 || BLOCKED.has(node.tagName)) return null;
    const clean = TAGS.has(node.tagName)
      ? output.createElement(node.tagName.toLowerCase())
      : output.createDocumentFragment();
    if (node.tagName === "A") {
      try {
        const url = new URL(node.getAttribute("href"));
        if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
          clean.setAttribute("href", url.href);
          clean.setAttribute("target", "_blank");
          clean.setAttribute("rel", "noreferrer noopener");
        }
      } catch { /* Invalid links remain readable text. */ }
    }
    for (const child of node.childNodes) {
      const result = copy(child, depth + 1);
      if (result) clean.append(result);
    }
    return clean;
  }
  const fragment = output.createDocumentFragment();
  for (const child of parsed.body.childNodes) {
    const result = copy(child);
    if (result) fragment.append(result);
  }
  container.replaceChildren(fragment);
}
