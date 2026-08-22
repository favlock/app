import { isChromeExtensionId } from "./extensionPairing";
import { postAuthenticatedJson } from "./authenticatedApi";

interface ExtensionSessionTokenResponse {
  data?: { token?: unknown };
}

export async function createExtensionSessionToken({
  extensionId,
  accessToken,
}: {
  extensionId: string;
  accessToken: string;
}): Promise<string> {
  if (!isChromeExtensionId(extensionId)) {
    throw new Error("The Chrome extension ID is invalid.");
  }

  const response = (await postAuthenticatedJson(
    "/v1/extensions/session",
    accessToken,
    { extensionId },
    "FavLock could not authorize the extension. Please try again.",
  )) as ExtensionSessionTokenResponse | null;
  if (
    typeof response?.data?.token !== "string" ||
    !response.data.token
  ) {
    throw new Error("FavLock received an invalid extension authorization.");
  }

  return response.data.token;
}
