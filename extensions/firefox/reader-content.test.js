// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderArticleContent } from "./reader-content.js";

describe("Firefox Reader content boundary", () => {
  it("preserves reading markup and safe links without active content or attributes", () => {
    const container = document.createElement("main");
    renderArticleContent(container, '<p onclick="steal()">Read <strong>this</strong><img src="https://tracker.example/pixel"><script>steal()</script><a href="javascript:steal()">bad</a><a href="https://example.com/story" style="color:red">source</a></p><svg onload="steal()"/>');
    expect(container.textContent).toBe("Read thisbadsource");
    expect(container.querySelector("strong").textContent).toBe("this");
    expect(container.querySelector("img, script, svg, [onclick], [style]")).toBeNull();
    const links = container.querySelectorAll("a");
    expect(links[0].hasAttribute("href")).toBe(false);
    expect(links[1].rel).toBe("noreferrer noopener");
  });
  it("bounds article input", () => {
    expect(() => renderArticleContent(document.createElement("div"), "a".repeat(150_001))).toThrow("Invalid article");
  });
});
