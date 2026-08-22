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
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { supportsPasskeyEncryption } from "../lib/passkeyEncryption";

interface EncryptionKeyDialogProps {
  encryptionKey: string | null;
  rememberDevice: boolean;
  onRememberDeviceChange: (rememberDevice: boolean) => void;
  onSaveWithPasskey: () => Promise<void>;
  onComplete: () => void | Promise<void>;
}

export default function EncryptionKeyDialog({
  encryptionKey,
  rememberDevice,
  onRememberDeviceChange,
  onSaveWithPasskey,
  onComplete,
}: EncryptionKeyDialogProps) {
  const [encryptionKeyQr, setEncryptionKeyQr] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [savingWithPasskey, setSavingWithPasskey] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(true);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [passkeySaved, setPasskeySaved] = useState(false);
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
    if (encryptionKey) return;

    setPasskeySaved(false);
    setShowRecoveryKey(!passkeySupported);
    setError(null);
  }, [encryptionKey, passkeySupported]);

  useEffect(() => {
    let cancelled = false;

    if (!encryptionKey) {
      setEncryptionKeyQr(null);
      return;
    }

    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(encryptionKey, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 220,
          color: {
            dark: "#111827",
            light: "#ffffff",
          },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setEncryptionKeyQr(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setEncryptionKeyQr(null);
      });

    return () => {
      cancelled = true;
    };
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

  const completeSetup = async () => {
    setError(null);
    setCompleting(true);
    try {
      await onComplete();
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
      <DialogTitle>Your encryption key is ready</DialogTitle>
      <DialogDescription>
        FavLock created a key that is separate from your account password to
        protect your bookmark data.
      </DialogDescription>
      <DialogBody>
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex gap-3">
              <LockKeyhole className="mt-0.5 size-5 shrink-0 text-zinc-700" />
              <div>
                <p className="text-sm font-semibold text-zinc-950">
                  Why you have an encryption key
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  It encrypts your bookmark titles, URLs, collections, and tags
                  before they are synced. Only this key can unlock that data;
                  FavLock cannot read it or recover the key for you.
                </p>
              </div>
            </div>
          </div>

          {!showRecoveryKey && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                <div>
                  <p className="text-sm font-semibold text-emerald-950">
                    Why protect it with a passkey
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    A passkey protects an encrypted copy of this key and lets
                    you unlock it with your fingerprint, face, or device PIN.
                    If your passkey manager syncs it, you can also unlock on
                    compatible devices after signing in.
                  </p>
                  <p className="mt-2 text-xs text-emerald-800">
                    This passkey protects your encryption key. It does not
                    replace how you sign in to your FavLock account.
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
              <div className="rounded-xl bg-zinc-100 px-6 py-4 text-center">
                {encryptionKey &&
                  [
                    encryptionKey.split(" ").slice(0, 4).join(" "),
                    encryptionKey.split(" ").slice(4).join(" "),
                  ].map((line, index) => (
                    <p
                      key={index}
                      className="select-all font-mono text-xl font-bold tracking-widest text-zinc-900"
                    >
                      {line}
                    </p>
                  ))}
              </div>
              {encryptionKeyQr && (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4">
                  <img
                    src={encryptionKeyQr}
                    alt="Encryption key QR code"
                    className="size-48"
                  />
                  <Text className="text-center text-sm text-zinc-500">
                    Scan this on your phone after login to unlock there too.
                  </Text>
                </div>
              )}
              <CheckboxField>
                <Checkbox
                  color="emerald"
                  checked={rememberDevice}
                  onChange={onRememberDeviceChange}
                  disabled={busy}
                />
                <Label>Remember this device</Label>
                <Description>
                  Saves the key in this browser profile so FavLock can unlock
                  automatically next time. Leave this off on shared devices.
                </Description>
              </CheckboxField>
            </>
          )}

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
            <Button color="emerald" onClick={completeSetup} disabled={busy}>
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
