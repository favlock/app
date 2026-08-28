import { CloudAccessError, cloudStatusMessage } from "../lib/cloudAccess";
import type { AuthRequestSession, FavLockAuthClient } from "../lib/favLockAuth";

// Endpoint-contract tests supply opaque fixture tokens and exercise the real
// transport. Session lifecycle and retry coordination have separate tests.
export const favLockAuth = {
  async getRequestSession(accessToken: string): Promise<AuthRequestSession> {
    return { accessToken, userId: "11111111-1111-4111-8111-111111111111", generation: 1 };
  },
  async refreshRequestSession(): Promise<AuthRequestSession> {
    throw new CloudAccessError("reconnect_required", cloudStatusMessage("reconnect_required"));
  },
  isRequestSessionCurrent(): boolean {
    return true;
  },
  getConnectionError(): Error | null {
    return null;
  },
} satisfies Pick<FavLockAuthClient, "getRequestSession" | "refreshRequestSession" | "isRequestSessionCurrent" | "getConnectionError">;
