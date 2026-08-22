import { describe, expect, it } from "vitest";
import {
  getNoteText,
  getNoteTextLength,
  sanitizeNoteHtml,
} from "./noteContent";

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
    expect(sanitizeNoteHtml("<section>Hello <mark>there</mark></section>")).toBe(
      "Hello there",
    );
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
});
