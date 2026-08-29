import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Text } from "./ui/text";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import { Description, Label } from "./ui/fieldset";
import { Check, Copy, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { supportsPasskeyEncryption } from "../lib/passkeyEncryption";
import type { ProtectionMethod } from "../lib/onboarding";

interface EncryptionKeyDialogProps {
  encryptionKey: string | null;
  preparedMethod: ProtectionMethod | null;
  onSaveWithPasskey: () => Promise<void>;
  onComplete: (method: ProtectionMethod) => void | Promise<void>;
}

export default function EncryptionKeyDialog({
  encryptionKey,
  preparedMethod,
  onSaveWithPasskey,
  onComplete,
}: EncryptionKeyDialogProps) {
  const [completing, setCompleting] = useState(false);
  const [savingWithPasskey, setSavingWithPasskey] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(true);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [passkeySaved, setPasskeySaved] = useState(false);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [recoveryKeyCopied, setRecoveryKeyCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supportsPasskeyEncryption().then((supported) => {
      if (!active) return;
      setPasskeySupported(supported);
      if (!supported) setShowRecoveryKey(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!encryptionKey) {
      setPasskeySaved(false);
      setRecoveryConfirmed(false);
      setShowRecoveryKey(!passkeySupported);
      setError(null);
      return;
    }

    if (preparedMethod === "passkey") {
      setPasskeySaved(true);
      setShowRecoveryKey(true);
    }
  }, [encryptionKey, passkeySupported, preparedMethod]);

  useEffect(() => {
    setRecoveryKeyCopied(false);
  }, [encryptionKey]);

  const downloadKey = () => {
    if (!encryptionKey) return;

    const blob = new Blob([encryptionKey], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "encryption-key.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyKey = async () => {
    if (!encryptionKey) return;

    setError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(encryptionKey);
      setRecoveryKeyCopied(true);
    } catch {
      setRecoveryKeyCopied(false);
      setError(
        "Could not copy the recovery key. Select the key and copy it manually instead.",
      );
    }
  };

  const completeSetup = async () => {
    setError(null);
    setCompleting(true);
    try {
      await onComplete(passkeySaved ? "passkey" : "recovery-key");
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : "Could not finish encryption setup.",
      );
    } finally {
      setCompleting(false);
    }
  };

  const saveWithPasskey = async () => {
    setError(null);
    setSavingWithPasskey(true);
    try {
      await onSaveWithPasskey();
      setPasskeySaved(true);
      setShowRecoveryKey(true);
    } catch (passkeyError) {
      setError(
        passkeyError instanceof Error
          ? passkeyError.message
          : "Could not save the encryption key with a passkey.",
      );
    } finally {
      setSavingWithPasskey(false);
    }
  };

  const busy = completing || savingWithPasskey;

  return (
    <Dialog open={!!encryptionKey} onClose={() => {}}>
      <DialogTitle>Protect your library</DialogTitle>
      <DialogDescription>
        Signing in opens your FavLock account. Unlocking your encrypted library
        requires a separate protection method.
      </DialogDescription>
      <DialogBody>
        <div className="space-y-4">
          {!showRecoveryKey && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 size-5 shrink-0 text-zinc-700" />
                <div>
                  <p className="text-sm font-semibold text-zinc-950">
                    Your library has its own key
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Choose one durable way to unlock it. FavLock cannot recover
                    your encrypted library if every passkey and recovery-key
                    copy is lost.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!showRecoveryKey && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                <div>
                  <p className="text-sm font-semibold text-emerald-950">
                    Recommended: protect it with a passkey
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    A passkey protects an encrypted copy of this key and lets
                    you unlock it with your fingerprint, face, or device PIN.
                    If your passkey manager syncs it, you can also unlock on
                    compatible devices after signing in.
                  </p>
                  <p className="mt-2 text-xs text-emerald-800">
                    This passkey unlocks your library after account sign-in. It
                    does not sign you in to FavLock.
                  </p>
                </div>
              </div>
            </div>
          )}

          {showRecoveryKey && (
            <>
              {passkeySaved ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex gap-3">
                    <KeyRound className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-950">
                        Encryption key protected
                      </p>
                      <p className="mt-1 text-sm text-emerald-800">
                        Your passkey is ready. You can also download the
                        recovery key below and keep it somewhere private.
                      </p>
                    </div>
                  </div>
                </div>
              ) : !passkeySupported ? (
                <Text className="text-sm text-amber-700">
                  This browser or passkey provider cannot protect encryption
                  keys. Save the recovery key instead.
                </Text>
              ) : null}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div
                      className="select-all font-mono text-lg font-bold tracking-wide text-zinc-900 sm:text-xl"
                      aria-label="Recovery key"
                    >
                      {encryptionKey &&
                        [
                          encryptionKey.split(" ").slice(0, 4).join(" "),
                          encryptionKey.split(" ").slice(4, 8).join(" "),
                        ].map((row) => (
                          <p key={row} className="whitespace-nowrap">
                            {row}
                          </p>
                        ))}
                    </div>
                    <Text className="mt-2 text-sm text-zinc-600">
                      Keep this key private. Anyone with it can unlock your
                      encrypted library.
                    </Text>
                  </div>
                  <Button
                    type="button"
                    outline
                    onClick={() => void copyKey()}
                    disabled={busy}
                    className="flex-none cursor-pointer whitespace-nowrap"
                  >
                    {recoveryKeyCopied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {recoveryKeyCopied ? "Copied" : "Copy key"}
                  </Button>
                </div>
              </div>
              {recoveryKeyCopied && (
                <Text
                  className="text-sm text-emerald-700!"
                  role="status"
                  aria-live="polite"
                >
                  Recovery key copied to clipboard.
                </Text>
              )}
              {!passkeySaved && (
                <CheckboxField>
                  <Checkbox
                    color="emerald"
                    checked={recoveryConfirmed}
                    onChange={setRecoveryConfirmed}
                    disabled={busy}
                  />
                  <Label>I saved this recovery key somewhere private</Label>
                  <Description>
                    I understand FavLock cannot restore my encrypted library if
                    I lose this key and every unlocked device.
                  </Description>
                </CheckboxField>
              )}
            </>
          )}

          <details className="rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-600">
            <summary className="cursor-pointer font-semibold text-zinc-800">
              How library protection works
            </summary>
            <p className="mt-2">
              FavLock encrypts protected library details in this browser before
              sync. A passkey protects an encrypted copy of the library key; a
              recovery key is the manual fallback. Passkey availability and
              syncing depend on your browser and passkey provider.
            </p>
          </details>

          {error && (
            <Text className="text-sm text-red-600!" role="alert">
              {error}
            </Text>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        {showRecoveryKey ? (
          <>
            {passkeySupported && !passkeySaved && (
              <Button
                plain
                onClick={() => {
                  setError(null);
                  setShowRecoveryKey(false);
                }}
                disabled={busy}
              >
                Back
              </Button>
            )}
            <Button outline onClick={downloadKey} disabled={busy}>
              Download recovery key
            </Button>
            <Button
              color="emerald"
              onClick={completeSetup}
              disabled={busy || (!passkeySaved && !recoveryConfirmed)}
            >
              {completing
                ? "Saving..."
                : passkeySaved
                  ? "Continue"
                  : "I saved it, continue"}
            </Button>
          </>
        ) : (
          <>
            <Button
              outline
              onClick={() => setShowRecoveryKey(true)}
              disabled={busy}
            >
              Save recovery key instead
            </Button>
            <Button
              color="emerald"
              onClick={saveWithPasskey}
              disabled={busy}
            >
              <KeyRound className="size-4" />
              {savingWithPasskey
                ? "Creating passkey..."
                : "Protect with a passkey"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
