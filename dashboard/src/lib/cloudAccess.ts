export type CloudStatus = "signed_out" | "available" | "offline" | "reconnect_required" | "restricted" | "unavailable";

export class CloudAccessError extends Error {
  readonly code: "reconnect_required" | "restricted" | "unavailable" | "quota_exceeded";
  readonly details?: { resource: string; limit: number };
  constructor(
    code: CloudAccessError["code"],
    message: string,
    details?: { resource: string; limit: number },
  ) {
    super(message);
    this.name = "CloudAccessError";
    this.code = code;
    this.details = details;
  }
}

type Failure = { accessToken: string; status: Exclude<CloudStatus, "signed_out" | "available" | "offline"> };
const listeners = new Set<(failure: Failure) => void>();

export function reportCloudFailure(accessToken: string, status: Failure["status"]): void {
  for (const listener of listeners) listener({ accessToken, status });
}

export function subscribeToCloudFailures(listener: (failure: Failure) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function cloudStatusMessage(status: CloudStatus): string {
  if (status === "restricted") return "Cloud access is restricted. Your saved local library remains available.";
  if (status === "reconnect_required") return "Reconnect to the cloud when you need it. Your saved local library remains available.";
  if (status === "offline") return "You’re offline. You can browse your saved local library; cloud changes need a connection.";
  return "Cloud services are temporarily unavailable. Your saved local library remains available.";
}
