import { GENERATED_FAVLOCK_CONFIG } from "./config.generated.js";

export const FAVLOCK_CONFIG = Object.freeze({
  ...GENERATED_FAVLOCK_CONFIG,
  dashboardUrl: new URL(GENERATED_FAVLOCK_CONFIG.dashboardUrl).toString(),
  apiUrl: new URL(GENERATED_FAVLOCK_CONFIG.apiUrl)
    .toString()
    .replace(/\/$/, ""),
});

export function assertConfiguredExtensionId() {
  const runtimeId = globalThis.chrome?.runtime?.id;
  if (
    runtimeId &&
    FAVLOCK_CONFIG.extensionId &&
    runtimeId !== FAVLOCK_CONFIG.extensionId
  ) {
    throw new Error(
      "This build is configured for the official FavLock Chrome Web Store extension ID.",
    );
  }
}
