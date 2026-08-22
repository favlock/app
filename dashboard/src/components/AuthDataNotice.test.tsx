import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AuthLegalNotice,
  GoogleAccountDataNotice,
} from "./AuthDataNotice";
import {
  WEB_PRIVACY_URL,
  WEB_TERMS_URL,
} from "../lib/appUrls";

describe("AuthDataNotice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("explains the limited use of Google account data", async () => {
    await act(async () => {
      root.render(<GoogleAccountDataNotice />);
    });

    expect(container.textContent).toContain(
      "name, email address, and Google account identifier",
    );
    expect(container.textContent).toContain(
      "only to create and authenticate your account",
    );
    expect(container.querySelector("a")?.href).toBe(
      `${WEB_PRIVACY_URL}#data-we-process`,
    );
  });

  it("links users to both legal documents", async () => {
    await act(async () => {
      root.render(<AuthLegalNotice />);
    });

    const links = Array.from(container.querySelectorAll("a")).map(
      (link) => link.href,
    );

    expect(links).toEqual([WEB_TERMS_URL, WEB_PRIVACY_URL]);
  });
});
