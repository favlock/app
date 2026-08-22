import { describe, expect, it } from "vitest";
import { getMainDomain } from "./domains";

describe("domains", () => {
  it("shows only the main domain for bookmark cards", () => {
    expect(getMainDomain("https://test.google.com/search")).toBe("google.com");
    expect(getMainDomain("http://abc.dd.aaa.domain.com:2334/path")).toBe(
      "domain.com",
    );
    expect(getMainDomain("https://news.bbc.co.uk/story")).toBe("bbc.co.uk");
    expect(getMainDomain("http://127.0.0.1:3000")).toBe("127.0.0.1");
  });
});
