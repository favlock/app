import { describe, expect, it } from "vitest";
import {
  decryptWebHighlightPayload,
  encryptWebHighlightPayload,
  parseWebHighlightPayload,
} from "./webHighlight";

const payload = {
  version: 1,
  quote: { exact: "Selected passage", prefix: "Before ", suffix: " after" },
  position: { start: 7, end: 23 },
  dom: { startPath: "0/0", startOffset: 7, endPath: "0/0", endOffset: 23 },
  color: "yellow",
  note: "Remember this",
  capturedAt: "2026-09-02T10:00:00.000Z",
};

describe("web highlight payload", () => {
  it("parses the versioned encrypted plaintext format", () => {
    expect(parseWebHighlightPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it.each([
    { ...payload, version: 2 },
    { ...payload, quote: { ...payload.quote, exact: "" } },
    { ...payload, position: { start: 20, end: 10 } },
    { ...payload, color: "orange" },
    { ...payload, capturedAt: "invalid" },
  ])("rejects malformed payload %#", (invalid) => {
    expect(parseWebHighlightPayload(JSON.stringify(invalid))).toBeNull();
  });

  it("encrypts protected fields separately and restores the payload", async () => {
    const encrypt = async (value: string) => `enc:${value}`;
    const decrypt = async (value: string) => value.slice(4);
    const encrypted = await encryptWebHighlightPayload(payload, encrypt);

    expect(encrypted).toEqual({
      version: 1,
      encryptedQuote: expect.stringMatching(/^enc:/),
      encryptedAnchors: expect.stringMatching(/^enc:/),
      encryptedAnnotation: "enc:Remember this",
      color: "yellow",
    });
    expect(encrypted).not.toHaveProperty("note");
    await expect(decryptWebHighlightPayload(encrypted, decrypt)).resolves.toEqual(payload);
  });
});
