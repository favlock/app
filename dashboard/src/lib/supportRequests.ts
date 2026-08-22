import { API_URL } from "./appUrls";

export type SupportRequestKind = "bug" | "feature" | "contact";

export interface SupportRequest {
  kind: SupportRequestKind;
  subject: string;
  message: string;
  website: string;
}

export async function submitSupportRequest(
  request: SupportRequest,
  accessToken: string,
) {
  if (!accessToken) {
    throw new Error("Please sign in again before contacting support.");
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}/v1/support/requests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...request,
        submissionId: crypto.randomUUID(),
      }),
    });
  } catch {
    throw new Error(
      "We could not reach support. Check your connection and try again.",
    );
  }

  const result = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      result?.error ?? "We could not send your message. Please try again.",
    );
  }
}
