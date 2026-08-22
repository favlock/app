import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppLogo } from "./AppLogo";

describe("AppLogo", () => {
  it("identifies the development build", () => {
    const markup = renderToStaticMarkup(<AppLogo />);

    expect(markup).toContain(">DEV<");
    expect(markup).toContain('aria-label="Development build"');
  });
});
