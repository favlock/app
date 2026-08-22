import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { KeyRound, Upload } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { exportRawKey, normalizeRawKey } from "../lib/encryption";
import {
  isAllowedFavLockExtensionId,
  sendEncryptionKeyToExtension,
} from "../lib/extensionPairing";
import { createExtensionSessionToken } from "../lib/extensionSession";
import {
  loadPasskeyEncryptionRecord,
  type PasskeyEncryptionRecord,
  unwrapEncryptionKeyWithPasskey,
} from "../lib/passkeyEncryption";
import { Button } from "../components/ui/button";
import { Heading } from "../components/ui/heading";
import { Input } from "../components/ui/input";
import { Text } from "../components/ui/text";
import { AuthLayout } from "../components/ui/auth-layout";

export default function ExtensionPair() {
  const [searchParams] = useSearchParams();
  const { session, user } = useAuth();
  const { cryptoKey, setRawKey } = useEncryption();
  const [rawKeyInput, setRawKeyInput] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [passkeyRecord, setPasskeyRecord] =
    useState<PasskeyEncryptionRecord | null>(null);
  const [checkingPasskey, setCheckingPasskey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extensionId = searchParams.get("extensionId");
  const expectedExtensionId = import.meta.env.VITE_CHROME_EXTENSION_ID;
  const needsExtensionSession = searchParams.get("auth") === "email";
  const validExtensionId = useMemo(
    () =>
      isAllowedFavLockExtensionId(extensionId, expectedExtensionId)
        ? extensionId
        : null,
    [expectedExtensionId, extensionId],
  );

  useEffect(() => {
    if (!user?.id || !session?.access_token || cryptoKey || connected) {
      setPasskeyRecord(null);
      return;
    }

    let active = true;
    setCheckingPasskey(true);
    void loadPasskeyEncryptionRecord(session.access_token)
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
  }, [connected, cryptoKey, session?.access_token, user?.id]);

  const connect = async (providedRawKey?: string) => {
    if (!user || !validExtensionId || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      let rawKey: string;
      if (providedRawKey) {
        rawKey = normalizeRawKey(providedRawKey);
        await setRawKey(rawKey, { rememberDevice });
      } else if (cryptoKey) {
        rawKey = await exportRawKey(cryptoKey);
      } else {
        rawKey = normalizeRawKey(rawKeyInput);
        await setRawKey(rawKey, { rememberDevice });
      }
      const sessionTokenHash = needsExtensionSession
          ? await createExtensionSessionToken({
              extensionId: validExtensionId,
              accessToken: session?.access_token ?? "",
            })
        : undefined;
      await sendEncryptionKeyToExtension({
        extensionId: validExtensionId,
        userId: user.id,
        rawKey,
        sessionTokenHash,
      });
      setConnected(true);
    } catch (pairingError) {
      setError(
        pairingError instanceof Error
          ? pairingError.message
          : "FavLock could not unlock the extension.",
      );
    } finally {
      setConnecting(false);
    }
  };

  const unlockWithPasskey = async () => {
    if (!passkeyRecord || !user || connecting) return;
    setError(null);
    try {
      const rawKey = await unwrapEncryptionKeyWithPasskey(
        passkeyRecord,
        user.id,
      );
      await connect(rawKey);
    } catch (passkeyError) {
      setError(
        passkeyError instanceof Error
          ? passkeyError.message
          : "Could not unlock with the passkey.",
      );
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const fileContent = (await file.text()).trim();
    if (!fileContent) {
      setError("File is empty.");
      return;
    }
    setRawKeyInput(fileContent);
    await connect(fileContent);
  };

  return (
    <AuthLayout>
      <div className="w-full">
        <span className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
          <KeyRound size={22} aria-hidden="true" />
        </span>
        <Heading>{connected ? "Extension connected" : "Unlock the extension"}</Heading>
        <Text className="mt-2">
          {connected
            ? "You can close this page and return to the site you were viewing."
            : "Your key lets the extension decrypt collection and tag names and encrypt new bookmarks locally."}
        </Text>

        {!validExtensionId && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
            This extension pairing request is not configured or is invalid.
          </div>
        )}

        {!connected && validExtensionId && !cryptoKey && (
          <div className="mt-5 space-y-4">
            {passkeyRecord && (
              <Button
                type="button"
                color="emerald"
                className="w-full justify-center"
                disabled={connecting}
                onClick={() => void unlockWithPasskey()}
              >
                <KeyRound data-slot="icon" aria-hidden="true" />
                {connecting ? "Unlocking..." : "Unlock with passkey"}
              </Button>
            )}
            {checkingPasskey && (
              <Text className="text-center text-sm text-zinc-500">
                Checking for a saved passkey...
              </Text>
            )}
            <Button
              type="button"
              outline
              className="w-full justify-center"
              disabled={connecting}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload data-slot="icon" aria-hidden="true" />
              Upload recovery key
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(event) => void handleFileUpload(event)}
            />
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200" />
              Or enter your key
              <span className="h-px flex-1 bg-zinc-200" />
            </div>
            <label className="block text-sm font-medium text-zinc-800" htmlFor="extension-encryption-key">
              FavLock encryption key
            </label>
            <Input
              id="extension-encryption-key"
              value={rawKeyInput}
              onChange={(event) => setRawKeyInput(event.target.value)}
              placeholder="XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX"
              autoComplete="off"
              spellCheck={false}
            />
            <label className="flex items-start gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                className="mt-1"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
              />
              Remember this key in the dashboard on this device too
            </label>
          </div>
        )}

        {cryptoKey && !connected && validExtensionId && (
          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-zinc-700">
            FavLock is already unlocked on this device. Confirm to pair the same key with the extension.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {!connected && (
          <Button
            type="button"
            color="emerald"
            className="mt-6 w-full"
            disabled={
              !validExtensionId ||
              connecting ||
              (!cryptoKey && !rawKeyInput.trim())
            }
            onClick={() => void connect()}
          >
            {connecting ? "Connecting..." : "Unlock extension"}
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
