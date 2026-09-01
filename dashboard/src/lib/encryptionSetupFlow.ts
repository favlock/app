export const ENCRYPTION_SETUP_REQUESTED_EVENT =
  "favlock:encryption-setup-requested";

export function requestEncryptionSetup(userId: string) {
  if (!userId) return;

  window.dispatchEvent(
    new CustomEvent(ENCRYPTION_SETUP_REQUESTED_EVENT, {
      detail: { userId },
    }),
  );
}
