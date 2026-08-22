(() => {
  if (window.__favlockExtractReader) {
    return window.__favlockExtractReader();
  }

  const BLOCKED_TAGS = new Set([
    "ASIDE",
    "BUTTON",
    "CANVAS",
    "DIALOG",
    "FOOTER",
    "FORM",
    "HEADER",
    "IFRAME",
    "INPUT",
    "NAV",
    "NOSCRIPT",
    "SCRIPT",
    "STYLE",
    "SVG",
    "TEMPLATE",
  ]);
  const ALLOWED_BLOCK_TAGS = new Set([
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "LI",
    "OL",
    "P",
    "UL",
  ]);
  const ALLOWED_INLINE_TAGS = new Set([
    "A",
    "B",
    "BR",
    "CODE",
    "DEL",
    "EM",
    "I",
    "MARK",
    "S",
    "STRONG",
    "SUB",
    "SUP",
    "U",
  ]);
  const MAX_READER_HTML_LENGTH = 150_000;

  function textLength(element) {
    return (element?.textContent || "").replace(/\s+/g, " ").trim().length;
  }

  function linkDensity(element) {
    const total = Math.max(textLength(element), 1);
    const linked = Array.from(element.querySelectorAll("a")).reduce(
      (sum, link) => sum + textLength(link),
      0,
    );
    return linked / total;
  }

  function candidateScore(element) {
    const paragraphs = Array.from(element.querySelectorAll("p"));
    const paragraphScore = paragraphs.reduce((score, paragraph) => {
      const length = textLength(paragraph);
      return score + (length >= 60 ? Math.min(length, 500) : 0);
    }, 0);
    const headingBonus = element.matches("article, main, [role='main']")
      ? 500
      : 0;
    return (paragraphScore + headingBonus) * (1 - linkDensity(element));
  }

  function findArticle() {
    const preferred = Array.from(
      document.querySelectorAll("article, main, [role='main']"),
    ).filter((element) => textLength(element) >= 300);
    const candidates = preferred.length
      ? preferred
      : Array.from(document.querySelectorAll("section, div")).filter(
          (element) =>
            element.querySelectorAll("p").length >= 2 &&
            textLength(element) >= 400,
        );

    return candidates.sort(
      (left, right) => candidateScore(right) - candidateScore(left),
    )[0] || document.body;
  }

  function absoluteUrl(value, baseUrl) {
    if (!value) return "";
    try {
      const url = new URL(value, baseUrl);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function cleanNode(node, output, baseUrl, insideReadingBlock = false) {
    if (node.nodeType === Node.TEXT_NODE) {
      return insideReadingBlock
        ? output.createTextNode((node.textContent || "").replace(/\s+/g, " "))
        : null;
    }
    if (!(node instanceof Element) || BLOCKED_TAGS.has(node.tagName)) {
      return null;
    }

    const fragment = output.createDocumentFragment();
    const isBlock = ALLOWED_BLOCK_TAGS.has(node.tagName);
    const isInline = ALLOWED_INLINE_TAGS.has(node.tagName);
    const childIsInsideReadingBlock =
      insideReadingBlock || isBlock || (isInline && insideReadingBlock);
    for (const child of Array.from(node.childNodes)) {
      const cleanChild = cleanNode(
        child,
        output,
        baseUrl,
        childIsInsideReadingBlock,
      );
      if (cleanChild) fragment.append(cleanChild);
    }
    if (!isBlock && !(isInline && insideReadingBlock)) return fragment;

    const clean = output.createElement(node.tagName.toLowerCase());
    if (node.tagName === "A") {
      const href = absoluteUrl(node.getAttribute("href"), baseUrl);
      if (href) {
        clean.setAttribute("href", href);
        clean.setAttribute("target", "_blank");
        clean.setAttribute("rel", "noreferrer noopener");
      }
    }
    clean.append(fragment);
    return clean;
  }

  function meta(...selectors) {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.getAttribute("content")?.trim();
      if (value) return value;
    }
    return "";
  }

  function attribute(attributeName, ...selectors) {
    for (const selector of selectors) {
      const value = document
        .querySelector(selector)
        ?.getAttribute(attributeName)
        ?.trim();
      if (value) return value;
    }
    return "";
  }

  function jsonLdDates() {
    const dates = { published: "", updated: "" };
    const visit = (value) => {
      if (!value || (dates.published && dates.updated)) return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== "object") return;
      if (!dates.published && typeof value.datePublished === "string") {
        dates.published = value.datePublished;
      }
      if (!dates.updated && typeof value.dateModified === "string") {
        dates.updated = value.dateModified;
      }
      Object.values(value).forEach(visit);
    };

    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        visit(JSON.parse(script.textContent || ""));
      } catch {
        // Ignore malformed structured data and continue with page metadata.
      }
    });
    return dates;
  }

  function normalizedDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function hasVisibleAccessRestriction() {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          '[class*="paywall" i]',
          '[id*="paywall" i]',
          '[class*="subscription-wall" i]',
          '[id*="subscription-wall" i]',
          '[class*="metered" i]',
          '[data-testid*="paywall" i]',
          'dialog[open]',
          '[role="dialog"]',
        ].join(","),
      ),
    );
    const restrictionCopy =
      /subscribe\s+to\s+(continue|read|unlock)|sign\s+in\s+to\s+(continue|read)|subscription\s+(required|needed)|unlock\s+(this|the)\s+article|you(?:'ve| have)\s+reached\s+your\s+(article|free)\s+limit/i;

    return candidates.some(
      (element) =>
        isVisible(element) &&
        restrictionCopy.test((element.textContent || "").replace(/\s+/g, " ")),
    );
  }

  window.__favlockExtractReader = () => {
    if (hasVisibleAccessRestriction()) {
      return { blockedReason: "access-control" };
    }

    const source = findArticle();
    const output = document.implementation.createHTMLDocument("");
    const container = output.createElement("article");
    const cleaned = cleanNode(source, output, location.href);
    if (cleaned) container.append(cleaned);

    container.querySelectorAll("p, div, span, section").forEach((element) => {
      if (!textLength(element)) element.remove();
    });

    const headline = container.querySelector("h1");
    const title =
      headline?.textContent?.trim() ||
      meta('meta[property="og:title"]', 'meta[name="twitter:title"]') ||
      document.title ||
      "Untitled article";

    if (headline) {
      while (container.firstElementChild && container.firstElementChild !== headline) {
        container.firstElementChild.remove();
      }
      headline.remove();
    }

    const structuredDates = jsonLdDates();
    const publishedAt = normalizedDate(
      meta(
        'meta[property="article:published_time"]',
        'meta[name="date"]',
        'meta[name="pubdate"]',
        'meta[itemprop="datePublished"]',
      ) ||
        attribute(
          "datetime",
          'time[itemprop="datePublished"]',
          'time[class*="publish" i]',
        ) ||
        structuredDates.published,
    );
    const updatedAt = normalizedDate(
      meta(
        'meta[property="article:modified_time"]',
        'meta[property="og:updated_time"]',
        'meta[itemprop="dateModified"]',
      ) ||
        attribute(
          "datetime",
          'time[itemprop="dateModified"]',
          'time[class*="update" i]',
          'time[class*="modif" i]',
        ) ||
        structuredDates.updated,
    );
    const byline =
      meta('meta[name="author"]', 'meta[property="article:author"]') ||
      source
        .querySelector('[rel="author"], [itemprop="author"], [class*="author" i]')
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ||
      "";
    const siteName =
      meta('meta[property="og:site_name"]') || location.hostname.replace(/^www\./, "");
    while (
      container.innerHTML.length > MAX_READER_HTML_LENGTH &&
      container.lastElementChild
    ) {
      container.lastElementChild.remove();
    }
    const text = (container.textContent || "").replace(/\s+/g, " ").trim();

    return {
      title: title.slice(0, 500),
      siteName: siteName.slice(0, 200),
      byline: byline.slice(0, 300),
      publishedAt,
      updatedAt,
      sourceUrl: location.href,
      html: container.innerHTML,
      textLength: text.length,
    };
  };

  return window.__favlockExtractReader();
})();
