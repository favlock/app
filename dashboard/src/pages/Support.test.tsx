import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitSupportRequest } from "../lib/supportRequests";
import Support from "./Support";

vi.mock("../lib/supportRequests", () => ({
  submitSupportRequest: vi.fn(),
}));

vi.mock("../context/useAuth", () => ({
  useAuth: () => ({
    user: { email: "signed-in@favlock.app" },
    session: { access_token: "signed-in-access-token" },
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("Support contact form", () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderSupport = async (initialEntry = "/support") => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              element={
                <Outlet
                  context={{
                    setIsMobileSidebarOpen: vi.fn(),
                    openAddBookmark: vi.fn(),
                  }}
                />
              }
            >
              <Route path="support" element={<Support />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });
  };

  beforeEach(async () => {
    vi.mocked(submitSupportRequest).mockReset();
    vi.mocked(submitSupportRequest).mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderSupport();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const setValue = async (
    selector: string,
    value: string,
  ) => {
    const field = container.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(selector)!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(field),
        "value",
      )?.set;
      valueSetter?.call(field, value);
      field.dispatchEvent(
        new Event(field instanceof HTMLSelectElement ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
  };

  it("opens the contact tab by default", () => {
    const tabs = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];

    expect(tabs).toHaveLength(2);
    expect(
      container
        .querySelector("#contact-tab")
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      container
        .querySelector('[role="tabpanel"]')
        ?.getAttribute("aria-labelledby"),
    ).toBe("contact-tab");
    expect(container.querySelectorAll("form")).toHaveLength(1);
  });

  it("shows the changelog in its tab", async () => {
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("#changelog-tab")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container
        .querySelector("#changelog-tab")
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.textContent).toContain("v1.4.0");
    expect(container.textContent).toContain("v1.3.2");
    expect(container.textContent).toContain(
      "View, copy, or share your encryption key with a private QR code",
    );
    expect(container.textContent).toContain(
      "Change or add your account password from Security & privacy settings.",
    );
    expect(container.textContent).toContain("v1.0.0");
    expect(container.textContent).toContain("August 11, 2026");
    expect(container.textContent).toContain(
      "bookmarks, notes, tasks, and saved articles",
    );
  });

  it("opens the changelog tab from its direct link", async () => {
    act(() => root.unmount());
    root = createRoot(container);
    await renderSupport("/support#changelog");

    expect(
      container
        .querySelector("#changelog-tab")
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.textContent).toContain("v1.10.0");
  });

  it("moves between tabs with arrow keys", async () => {
    const contactTab =
      container.querySelector<HTMLButtonElement>("#contact-tab")!;
    contactTab.focus();

    await act(async () => {
      contactTab.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(document.activeElement?.id).toBe("changelog-tab");
    expect(
      container
        .querySelector("#changelog-tab")
        ?.getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("shows the signed-in email without allowing edits", () => {
    const email = container.querySelector<HTMLInputElement>("#support-email")!;

    expect(email.value).toBe("signed-in@favlock.app");
    expect(email.disabled).toBe(true);
    expect(container.textContent).toContain(
      "Replies will be sent to your FavLock account email.",
    );
  });

  it("offers message, bug report, and feature request types", () => {
    const options = [
      ...container.querySelectorAll<HTMLOptionElement>(
        "#support-kind option",
      ),
    ];

    expect(options.map(({ value, textContent }) => [value, textContent])).toEqual(
      [
        ["contact", "Message"],
        ["bug", "Report a bug"],
        ["feature", "Request a feature"],
      ],
    );
  });

  it.each([
    { kind: "contact", successMessage: "Message sent." },
    { kind: "bug", successMessage: "Bug report sent." },
    { kind: "feature", successMessage: "Feature request sent." },
  ])("submits a $kind message", async ({ kind, successMessage }) => {
    await setValue("#support-kind", kind);
    await setValue("#support-subject", "Test subject");
    await setValue("#support-message", "Test message");

    await act(async () => {
      container
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(submitSupportRequest).toHaveBeenCalledWith(
      {
        kind,
        subject: "Test subject",
        message: "Test message",
        website: "",
      },
      "signed-in-access-token",
    );
    expect(container.textContent).toContain(successMessage);
  });

  it("keeps the message when delivery fails", async () => {
    vi.mocked(submitSupportRequest).mockRejectedValue(
      new Error("Delivery is unavailable."),
    );

    await setValue("#support-subject", "Help");
    await setValue("#support-message", "Please keep this message.");

    await act(async () => {
      container
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });

    expect(container.textContent).toContain("Delivery is unavailable.");
    expect(
      container.querySelector<HTMLTextAreaElement>("#support-message")?.value,
    ).toBe("Please keep this message.");
  });
});
