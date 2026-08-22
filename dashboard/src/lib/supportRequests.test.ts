import { afterEach, describe, expect, it, vi } from "vitest";
import { submitSupportRequest } from "./supportRequests";

describe("submitSupportRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the form to the contact endpoint with an idempotency id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "123e4567-e89b-12d3-a456-426614174000",
    );

    await submitSupportRequest(
      {
        kind: "bug",
        subject: "Broken bookmark",
        message: "The bookmark does not save.",
        website: "",
      },
      "signed-in-access-token",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/v1\/support\/requests$/);
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: "Bearer signed-in-access-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(options.body as string)).toEqual({
      kind: "bug",
      subject: "Broken bookmark",
      message: "The bookmark does not save.",
      website: "",
      submissionId: "123e4567-e89b-12d3-a456-426614174000",
    });
  });

  it("surfaces an error returned by the contact endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Please wait and try again." }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      submitSupportRequest(
        {
          kind: "contact",
          subject: "Question",
          message: "Can you help?",
          website: "",
        },
        "signed-in-access-token",
      ),
    ).rejects.toThrow("Please wait and try again.");
  });

  it("provides a useful message when the endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Offline")));

    await expect(
      submitSupportRequest(
        {
          kind: "feature",
          subject: "New feature",
          message: "Please add it.",
          website: "",
        },
        "signed-in-access-token",
      ),
    ).rejects.toThrow("Check your connection");
  });

  it("does not submit without a signed-in session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitSupportRequest(
        {
          kind: "contact",
          subject: "Question",
          message: "Can you help?",
          website: "",
        },
        "",
      ),
    ).rejects.toThrow("sign in again");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
