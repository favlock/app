import { useCallback, useEffect, useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { getProfileNamesFromUser } from "../lib/auth";
import { exportRawKey } from "../lib/encryption";
import {
  createPasskeyEncryptionRecord,
  loadPasskeyEncryptionRecord,
  savePasskeyEncryptionRecord,
  supportsPasskeyEncryption,
  type PasskeyEncryptionRecord,
} from "../lib/passkeyEncryption";
import ConfirmDialog from "./ConfirmDialog";
import { Button } from "./ui/button";
import { Text } from "./ui/text";

type PasskeyStatus = {
  type: "error" | "info" | "success";
  message: string;
};

export default function PasskeySettingsSection() {
  const { session, user } = useAuth();
  const { cryptoKey, keyLoading, triggerUnlock } = useEncryption();
  const accessToken = session?.access_token;
  const [passkeyRecord, setPasskeyRecord] =
    useState<PasskeyEncryptionRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null);
  const [recordCheckFailed, setRecordCheckFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingReplacement, setConfirmingReplacement] = useState(false);
  const [status, setStatus] = useState<PasskeyStatus | null>(null);

  const loadPasskeyState = useCallback(async () => {
    if (!accessToken) {
      setPasskeyRecord(null);
      setLoadingRecord(false);
      return;
    }

    setLoadingRecord(true);
    setRecordCheckFailed(false);
    setStatus(null);
    try {
      setPasskeyRecord(
        await loadPasskeyEncryptionRecord(accessToken),
      );
    } catch {
      setRecordCheckFailed(true);
      setStatus({
        type: "error",
        message: "Could not check your saved passkey. Try again.",
      });
    } finally {
      setLoadingRecord(false);
    }
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    void supportsPasskeyEncryption().then((supported) => {
      if (active) setPasskeySupported(supported);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadPasskeyState();
  }, [loadPasskeyState]);

  const saveNewPasskey = async () => {
    if (!user || !session?.access_token) return;

    setConfirmingReplacement(false);
    setStatus(null);

    if (!cryptoKey) {
      triggerUnlock();
      setStatus({
        type: "info",
        message: "Unlock this browser before creating a passkey.",
      });
      return;
    }

    setSaving(true);
    try {
      const rawKey = await exportRawKey(cryptoKey);
      const { firstName, lastName } = getProfileNamesFromUser(user);
      const displayName =
        [firstName, lastName].filter(Boolean).join(" ") ||
        user.email ||
        "FavLock user";
      const record = await createPasskeyEncryptionRecord({
        rawKey,
        userId: user.id,
        userName: user.email || user.id,
        displayName,
      });

      await savePasskeyEncryptionRecord(session.access_token, record);
      setPasskeyRecord(record);
      setStatus({
        type: "success",
        message: passkeyRecord
          ? "Passkey replaced. Use the new passkey the next time FavLock asks you to unlock."
          : "Passkey created. You can now use it to unlock FavLock.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not save the passkey. Your current unlock method was not changed.",
      });
    } finally {
      setSaving(false);
    }
  };

  const beginPasskeyChange = () => {
    setStatus(null);

    if (!cryptoKey) {
      triggerUnlock();
      setStatus({
        type: "info",
        message: "Unlock this browser before creating a passkey.",
      });
      return;
    }

    if (passkeyRecord) {
      setConfirmingReplacement(true);
      return;
    }

    void saveNewPasskey();
  };

  const unavailable = passkeySupported === false;
  const checking = loadingRecord || passkeySupported === null;

  return (
    <section
      id="passkey"
      className="scroll-mt-6 rounded-2xl border border-gray-200/80 dark:border-[var(--app-line)]/20 bg-[var(--app-highlight)]/80 p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-gray-500 dark:text-[var(--app-muted)]" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[var(--app-ink)]">Passkey</h3>
          </div>
          <Text className="mt-1 text-sm text-gray-600 dark:text-[var(--app-muted)]">
            {passkeyRecord
              ? "Replace the passkey that protects your encryption key. Keep your recovery key available until the new passkey is saved."
              : "Create a passkey to protect your encryption key and unlock FavLock without entering the recovery key."}
          </Text>
        </div>

        <Button
          type="button"
          color="emerald"
          disabled={
            checking || unavailable || recordCheckFailed || saving || keyLoading
          }
          onClick={beginPasskeyChange}
          className="flex-none cursor-pointer whitespace-nowrap"
        >
          {saving || checking ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound className="size-4" aria-hidden="true" />
          )}
          {saving
            ? passkeyRecord
              ? "Replacing passkey..."
              : "Creating passkey..."
            : checking
              ? "Checking passkey..."
              : passkeyRecord
                ? "Replace passkey"
                : "Create passkey"}
        </Button>
      </div>

      {unavailable ? (
        <div
          role="status"
          className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
        >
          This browser or passkey provider cannot protect your encryption key.
          Keep your recovery key somewhere private instead.
        </div>
      ) : null}

      {status ? (
        <div
          role={status.type === "error" ? "alert" : "status"}
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            status.type === "error"
              ? "bg-red-500/10 text-red-600 dark:text-red-300"
              : status.type === "success"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                : "bg-sky-500/10 text-sky-600 dark:text-sky-300"
          }`}
        >
          {status.message}
          {recordCheckFailed && !loadingRecord ? (
            <Button
              type="button"
              plain
              disabled={saving}
              onClick={() => void loadPasskeyState()}
              className="ml-2 cursor-pointer underline"
            >
              Check again
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmingReplacement}
        title="Replace passkey"
        description="Create a new FavLock passkey and replace the saved one? The current passkey will stop unlocking FavLock after the new passkey is saved."
        confirmLabel="Replace passkey"
        busyLabel="Replacing..."
        busy={saving}
        onClose={() => setConfirmingReplacement(false)}
        onConfirm={() => void saveNewPasskey()}
      />
    </section>
  );
}
