import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from "react";
import { KeyRound, LogOut, QrCode, Upload } from "lucide-react";
import { useEncryption } from "../context/useEncryption";
import { useAuth } from "../context/useAuth";
import {
  loadPasskeyEncryptionRecord,
  type PasskeyEncryptionRecord,
  unwrapEncryptionKeyWithPasskey,
} from "../lib/passkeyEncryption";
import { readLocalPasskeyRecord } from "../lib/localVault";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Description, Field, Label } from "./ui/fieldset";
import { Input } from "./ui/input";
import { Text } from "./ui/text";
import KeyQrScanner from "./KeyQrScanner";
import { Checkbox, CheckboxField } from "./ui/checkbox";
import LocalVaultSignOutDialog from "./LocalVaultSignOutDialog";

export default function UnlockDialog() {
  const { needsUnlock, setRawKey } = useEncryption();
  const { session, signOut, user, isLocalAccount } = useAuth();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [passkeyRecord, setPasskeyRecord] =
    useState<PasskeyEncryptionRecord | null>(null);
  const [checkingPasskey, setCheckingPasskey] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const accessToken = session?.access_token;

  useEffect(() => {
    if (!needsUnlock || !user?.id || (!isLocalAccount && !accessToken)) {
      setPasskeyRecord(null);
      return;
    }

    let active = true;
    setCheckingPasskey(true);
    const loadRecord = isLocalAccount
      ? readLocalPasskeyRecord(user.id)
      : loadPasskeyEncryptionRecord(accessToken!);
    void loadRecord
      .then((record) => {
        if (active) setPasskeyRecord(record);
      })
      .catch((loadError) => {
        console.error("Failed to check passkey encryption:", loadError);
        if (active) setPasskeyRecord(null);
      })
      .finally(() => {
        if (active) setCheckingPasskey(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, isLocalAccount, needsUnlock, user?.id]);

  const unlockWithRawKey = useCallback(
    async (rawKey: string) => {
      setError(null);
      setLoading(true);
      try {
        await setRawKey(rawKey, { rememberDevice });
        setKey("");
        setScanning(false);
        setRememberDevice(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Invalid key. Try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [rememberDevice, setRawKey],
  );

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!key.trim()) return;
    await unlockWithRawKey(key.trim());
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const fileContent = (await file.text()).trim();
    if (!fileContent) {
      setError("File is empty.");
      return;
    }

    setKey(fileContent);
    await unlockWithRawKey(fileContent);
  };

  const handleScannedKey = useCallback(
    (value: string) => {
      const scannedKey = value.trim();
      if (!scannedKey) return;

      setKey(scannedKey);
      void unlockWithRawKey(scannedKey);
    },
    [unlockWithRawKey],
  );

  const unlockWithPasskey = async () => {
    if (!passkeyRecord || !user) return;

    setError(null);
    setLoading(true);
    try {
      const rawKey = await unwrapEncryptionKeyWithPasskey(
        passkeyRecord,
        user.id,
      );
      await setRawKey(rawKey, { rememberDevice });
      setRememberDevice(true);
    } catch (passkeyError) {
      setError(
        passkeyError instanceof Error
          ? passkeyError.message
          : "Could not unlock with the passkey.",
      );
    } finally {
      setLoading(false);
    }
  };

  const signOutAndClear = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Could not sign out and clear local data.",
      );
      setSigningOut(false);
    }
  };

  const busy = loading || signingOut;

  return (
    <>
      <Dialog
        open={needsUnlock && !!user && !signingOut && !confirmingSignOut}
        onClose={() => {}}
        size="md"
      >
      <DialogTitle>Unlock encrypted data</DialogTitle>
      <DialogDescription>
        Your bookmarks are encrypted. Unlock with your passkey or use a recovery
        key.
      </DialogDescription>
      <DialogBody>
        <form id="unlock-form" onSubmit={handleSubmit}>
          {passkeyRecord && (
            <Button
              type="button"
              color="emerald"
              disabled={busy}
              onClick={unlockWithPasskey}
              className="mb-4 w-full justify-center"
            >
              <KeyRound data-slot="icon" aria-hidden="true" />
              {loading ? "Checking passkey..." : "Unlock with passkey"}
            </Button>
          )}
          {checkingPasskey && (
            <Text className="mb-4 text-center text-sm text-zinc-500">
              Checking for a saved passkey...
            </Text>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              type="button"
              outline
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="justify-center"
            >
              <Upload data-slot="icon" aria-hidden="true" />
              Upload recovery key
            </Button>
            <Button
              type="button"
              outline
              disabled={busy}
              onClick={() => setScanning((value) => !value)}
              className="justify-center"
            >
              <QrCode data-slot="icon" aria-hidden="true" />
              {scanning ? "Stop scanning" : "Scan QR"}
            </Button>
          </div>

          <KeyQrScanner active={scanning} onScan={handleScannedKey} />

          <Field className="mt-4">
            <Label>Encryption key</Label>
            <Input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="Enter key..."
            />
          </Field>
          <CheckboxField className="mt-4">
            <Checkbox
              color="emerald"
              checked={rememberDevice}
              onChange={setRememberDevice}
              disabled={busy}
            />
            <Label>Remember this device</Label>
            <Description>
              Saves the encryption key in this browser profile. Leave this off
              on shared devices; you will need the key again after a refresh.
            </Description>
          </CheckboxField>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleFileUpload}
          />
          {error && (
            <Text className="mt-2 text-red-600!  text-sm" role="alert">
              {error}
            </Text>
          )}
        </form>
      </DialogBody>
      <DialogActions>
        <Button
          type="button"
          outline
          disabled={busy}
          onClick={() => {
            if (isLocalAccount) {
              setError(null);
              setConfirmingSignOut(true);
              return;
            }
            void signOutAndClear();
          }}
        >
          <LogOut data-slot="icon" aria-hidden="true" />
          {signingOut
            ? "Signing out..."
            : isLocalAccount
              ? "Sign out & erase vault"
              : "Sign out & clear local data"}
        </Button>
        <Button type="submit" form="unlock-form" disabled={busy || !key.trim()}>
          {loading ? "Loading..." : "Unlock"}
        </Button>
      </DialogActions>
      </Dialog>
      <LocalVaultSignOutDialog
        open={confirmingSignOut}
        busy={signingOut}
        error={error}
        onClose={() => {
          setConfirmingSignOut(false);
          setError(null);
        }}
        onConfirm={() => void signOutAndClear()}
      />
    </>
  );
}
