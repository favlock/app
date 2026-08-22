import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { getProfileNamesFromUser } from "../lib/auth";
import { generateEncryptionKey } from "../lib/encryption";
import {
  createPasskeyEncryptionRecord,
  savePasskeyEncryptionRecord,
} from "../lib/passkeyEncryption";
import EncryptionKeyDialog from "./EncryptionKeyDialog";
import { queryClient } from "../lib/queryClient";
import {
  fetchUserInfo,
  USER_INFO_STALE_TIME,
  userInfoQueryKey,
} from "../lib/userInfo";
import { Button } from "./ui/button";
import { updateAccountProfile } from "../lib/accountSettingsApi";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

type EncryptionSetupResult = {
  key: string | null;
  error: string | null;
};

export default function EncryptionSetup() {
  const { session, user, loading: authLoading, signOut } = useAuth();
  const { keyLoading, setKeyRemembered, setRawKey } = useEncryption();
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [rememberDevice, setRememberDevice] = useState(true);
  const setupRef = useRef<{
    userId: string;
    promise: Promise<EncryptionSetupResult>;
  } | null>(null);

  useEffect(() => {
    if (authLoading || keyLoading) return;

    if (!user || !session?.access_token) {
      setupRef.current = null;
      setEncryptionKey(null);
      setSigningOut(false);
      return;
    }

    let setup = setupRef.current;
    if (setup?.userId !== user.id) {
      const setUpEncryption = async (): Promise<EncryptionSetupResult> => {
        let userInfo;
        try {
          userInfo = await queryClient.fetchQuery({
            queryKey: userInfoQueryKey(user.id),
            queryFn: () => fetchUserInfo(session.access_token),
            staleTime: USER_INFO_STALE_TIME,
          });
        } catch (error) {
          console.error("Failed to check encryption setup:", error);
          return {
            key: null,
            error: "Could not check your encryption setup. Try again.",
          };
        }

        if (userInfo?.key_verifier) return { key: null, error: null };

        if (!userInfo) {
          const { firstName, lastName } = getProfileNamesFromUser(user);
          try {
            await updateAccountProfile(session.access_token, {
              firstName,
              lastName,
            });
          } catch (error) {
            console.error("Failed to prepare encryption setup:", error);
            return {
              key: null,
              error: "Could not prepare encryption for this account. Try again.",
            };
          }

          await queryClient.invalidateQueries({
            queryKey: userInfoQueryKey(user.id),
          });
        }

        const key = generateEncryptionKey();
        try {
          await setRawKey(key);
          return { key, error: null };
        } catch (error) {
          console.error("Failed to set up encryption:", error);
          return {
            key: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not finish encryption setup. Try again.",
          };
        }
      };

      setup = { userId: user.id, promise: setUpEncryption() };
      setupRef.current = setup;
    }

    let active = true;
    void setup.promise.then((result) => {
      if (!active) return;
      setSetupError(result.error);
      if (result.key) setEncryptionKey(result.key);
    });

    return () => {
      active = false;
    };
  }, [
    authLoading,
    keyLoading,
    retryToken,
    session?.access_token,
    setRawKey,
    user,
  ]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      setSetupError(null);
    } catch (error) {
      setSetupError(
        error instanceof Error ? error.message : "Could not sign out. Try again.",
      );
      setSigningOut(false);
    }
  };

  return (
    <>
      <EncryptionKeyDialog
        encryptionKey={encryptionKey}
        rememberDevice={rememberDevice}
        onRememberDeviceChange={setRememberDevice}
        onSaveWithPasskey={async () => {
          if (!user || !session?.access_token || !encryptionKey) {
            throw new Error("Encryption setup is no longer available.");
          }

          const { firstName, lastName } = getProfileNamesFromUser(user);
          const displayName =
            [firstName, lastName].filter(Boolean).join(" ") ||
            user.email ||
            "FavLock user";
          const record = await createPasskeyEncryptionRecord({
            rawKey: encryptionKey,
            userId: user.id,
            userName: user.email || user.id,
            displayName,
          });
          await savePasskeyEncryptionRecord(session.access_token, record);
        }}
        onComplete={async () => {
          await setKeyRemembered(rememberDevice);

          // The Auth client may emit another event when this tab regains focus.
          // Keep the completed setup result from replaying the generated key
          // when that gives us a new `user` object for the same account.
          if (user && setupRef.current?.userId === user.id) {
            setupRef.current = {
              userId: user.id,
              promise: Promise.resolve({ key: null, error: null }),
            };
          }

          setEncryptionKey(null);
          setRememberDevice(true);

          // Refresh the profile only after this dialog closes. The dashboard
          // uses the saved verifier as the signal that it can start the
          // welcome flow, keeping the two dialogs in a predictable order.
          if (user) {
            await queryClient.invalidateQueries({
              queryKey: userInfoQueryKey(user.id),
            });
          }
        }}
      />
      <Dialog open={!!setupError} onClose={() => {}} size="sm">
        <DialogTitle>Encryption setup needs attention</DialogTitle>
        <DialogDescription>{setupError}</DialogDescription>
        <DialogActions>
          <Button
            type="button"
            outline
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </Button>
          <Button
            type="button"
            color="emerald"
            disabled={signingOut}
            onClick={() => {
              setupRef.current = null;
              setSetupError(null);
              setRetryToken((token) => token + 1);
            }}
          >
            Try again
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
