import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readerHtml = readFileSync(new URL("./reader.html", import.meta.url), "utf8");
const readerCss = readFileSync(new URL("./reader.css", import.meta.url), "utf8");
const readerJs = readFileSync(new URL("./reader.js", import.meta.url), "utf8");

describe("reader theme branding", () => {
  it("uses a dedicated logo with preserved brand colors on dark surfaces", () => {
    expect(readerHtml).toContain('class="reader-logo-dark" src="favlock-logo-dark.svg"');
    expect(readerCss).toContain(':root[data-theme="dark"] .reader-logo-dark');
    expect(readerCss).not.toContain("filter: brightness(0) invert(1)");
  });

  it("saves directly from Reader without opening a second dashboard flow", () => {
    expect(readerJs).toContain("await saveReadspaceArticle(article)");
    expect(readerJs).toContain('buttonLabel.textContent = "Saved"');
    expect(readerJs).not.toContain("chrome.tabs.create");
    expect(readerJs).not.toContain('saveUrl.searchParams.set("capture"');
  });
});
