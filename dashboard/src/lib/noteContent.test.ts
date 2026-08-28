import { describe, expect, it } from "vitest";
import {
  getNoteText,
  getNoteTextLength,
  sanitizeNoteHtml,
} from "./noteContent";
import { getEntryPlainText, safeEntryLink } from "./entryContent";

describe("note content", () => {
  it("preserves supported formatting and removes executable markup", () => {
    const sanitized = sanitizeNoteHtml(
      '<p onclick="alert(1)"><strong>Plan</strong><script>alert(1)</script></p>',
    );

    expect(sanitized).toBe("<p><strong>Plan</strong></p>");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("script");
  });

  it("unwraps unsupported elements while keeping their text", () => {
    expect(
      sanitizeNoteHtml("<section>Hello <span>there</span></section>"),
    ).toBe("Hello there");
  });

  it("counts visible unicode characters rather than markup", () => {
    const html = "<p><strong>Hello</strong> 🌙</p>";

    expect(getNoteText(html)).toBe("Hello 🌙");
    expect(getNoteTextLength(html)).toBe(7);
  });

  it("preserves checkbox lists and their checked state", () => {
    const sanitized = sanitizeNoteHtml(
      '<ul data-checklist="true" onclick="alert(1)"><li><input type="checkbox" checked autofocus>Done</li><li><input type="checkbox">Next</li></ul>',
    );

    expect(sanitized).toBe(
      '<ul data-checklist="true"><li><input type="checkbox" checked="">Done</li><li><input type="checkbox">Next</li></ul>',
    );
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("autofocus");
  });

  it("preserves headings, highlights, code, tables and ordered list starts", () => {
    const html =
      '<h2>Plan</h2><p><mark>Review</mark> <code>x &lt; 2</code></p><pre><code>one\n  two</code></pre><ol start="3"><li>Third</li></ol><table><tr><th colspan="2">Header</th></tr><tr><td>One</td><td>Two</td></tr></table>';
    const clean = sanitizeNoteHtml(html);
    expect(clean).toContain("<h2>Plan</h2>");
    expect(clean).toContain("<mark>Review</mark>");
    expect(clean).toContain("<pre><code>one\n  two</code></pre>");
    expect(clean).toContain('<ol start="3">');
    expect(clean).toContain('<th colspan="2">');
    expect(sanitizeNoteHtml(clean)).toBe(clean);
  });

  it("converts clipboard inline styles without keeping arbitrary CSS or resources", () => {
    const clean = sanitizeNoteHtml(
      '<p><span style="font-weight:700;font-style:italic;text-decoration:underline;background-image:url(https://tracker.example)">Text</span><img src="https://tracker.example/pixel"><iframe src="https://example.com">hidden</iframe><svg><script>bad()</script></svg></p>',
    );
    expect(clean).toContain("<strong>Text</strong>");
    expect(clean).toContain("<em>");
    expect(clean).toContain("<u>");
    expect(clean).not.toMatch(/style|tracker|iframe|svg|script|hidden/);
  });

  it.each([
    "javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,hello",
    "//example.com",
    "/relative",
    "file:///secret",
  ])("rejects unsafe or ambiguous link %s", (href) => {
    expect(safeEntryLink(href)).toBeNull();
    expect(sanitizeNoteHtml(`<a href="${href}">Text</a>`)).toBe("Text");
  });

  it("keeps safe links without event handlers or target control", () => {
    expect(
      sanitizeNoteHtml(
        '<a href="https://example.com/path?q=1" onclick="bad()" target="evil">Text</a>',
      ),
    ).toBe(
      '<a href="https://example.com/path?q=1" rel="noopener noreferrer">Text</a>',
    );
    expect(safeEntryLink("mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
  });

  it("preserves readable clipboard paragraph and checkbox boundaries", () => {
    expect(
      getEntryPlainText(
        '<p>First</p><p>Second</p><ul data-checklist="true"><li><input type="checkbox" checked>Done</li></ul>',
      ),
    ).toBe("First\nSecond\n[x] Done");
  });
});
