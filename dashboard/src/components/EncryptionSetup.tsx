import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { getProfileNamesFromUser } from "../lib/auth";
import {
  exportRawKey,
  formatEncryptionKey,
  generateEncryptionKey,
} from "../lib/encryption";
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
import {
  markProtectionConfirmed,
  markProtectionPending,
  readOnboardingState,
  type ProtectionMethod,
} from "../lib/onboarding";
import { ENCRYPTION_SETUP_REQUESTED_EVENT } from "../lib/encryptionSetupFlow";

type EncryptionSetupResult = {
  key: string | null;
  error: string | null;
  preparedMethod: ProtectionMethod | null;
  waitingForUnlock?: boolean;
};

export default function EncryptionSetup() {
  const { session, user, loading: authLoading, signOut } = useAuth();
  const {
    cryptoKey,
    keyLoading,
    setKeyRemembered,
    setRawKey,
    triggerUnlock,
  } = useEncryption();
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [preparedMethod, setPreparedMethod] =
    useState<ProtectionMethod | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupRequested, setSetupRequested] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const setupRef = useRef<{
    userId: string;
    waitingForUnlock: boolean;
    promise: Promise<EncryptionSetupResult>;
  } | null>(null);

  useEffect(() => {
    setSetupRequested(false);
    if (!user?.id) return;

    const handleSetupRequest = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.userId === user.id) {
        setSetupRequested(true);
      }
    };

    window.addEventListener(
      ENCRYPTION_SETUP_REQUESTED_EVENT,
      handleSetupRequest,
    );
    return () =>
      window.removeEventListener(
        ENCRYPTION_SETUP_REQUESTED_EVENT,
        handleSetupRequest,
      );
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || keyLoading) return;

    if (!user || !session?.access_token) {
      setupRef.current = null;
      setEncryptionKey(null);
      setPreparedMethod(null);
      setSetupError(null);
      setSetupRequested(false);
      setSigningOut(false);
      return;
    }

    let setup = setupRef.current;
    if (
      setup?.userId !== user.id ||
      (setup.waitingForUnlock && !!cryptoKey)
    ) {
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
            preparedMethod: null,
          };
        }

        const onboardingState = readOnboardingState(user.id);
        if (userInfo?.key_verifier) {
          if (
            onboardingState.protection.status !== "pending" ||
            !cryptoKey
          ) {
            if (
              onboardingState.protection.status === "pending" &&
              !cryptoKey
            ) {
              triggerUnlock();
            }
            return {
              key: null,
              error: null,
              preparedMethod: null,
              waitingForUnlock:
                onboardingState.protection.status === "pending" &&
                !cryptoKey,
            };
          }

          return {
            key: formatEncryptionKey(await exportRawKey(cryptoKey)),
            error: null,
            preparedMethod: onboardingState.protection.method,
          };
        }

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
              preparedMethod: null,
            };
          }

          await queryClient.invalidateQueries({
            queryKey: userInfoQueryKey(user.id),
          });
        }

        const key = cryptoKey
          ? formatEncryptionKey(await exportRawKey(cryptoKey))
          : generateEncryptionKey();
        markProtectionPending(user.id, onboardingState.protection.method);
        try {
          await setRawKey(key, { rememberDevice: true });
          return {
            key,
            error: null,
            preparedMethod: onboardingState.protection.method,
          };
        } catch (error) {
          if (
            !cryptoKey &&
            error instanceof Error &&
            error.message === "This key does not match your encrypted data."
          ) {
            triggerUnlock();
            return {
              key: null,
              error: null,
              preparedMethod: null,
              waitingForUnlock: true,
            };
          }
          console.error("Failed to set up encryption:", error);
          return {
            key: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not finish encryption setup. Try again.",
            preparedMethod: null,
          };
        }
      };

      setup = {
        userId: user.id,
        waitingForUnlock: false,
        promise: setUpEncryption(),
      };
      setupRef.current = setup;
    }

    let active = true;
    void setup.promise.then((result) => {
      if (!active) return;
      if (setupRef.current === setup) {
        setup.waitingForUnlock = !!result.waitingForUnlock;
      }
      setSetupError(result.error);
      if (result.error) setSetupRequested(true);
      setPreparedMethod(result.preparedMethod);
      if (result.key) setEncryptionKey(result.key);
    });

    return () => {
      active = false;
    };
  }, [
    authLoading,
    cryptoKey,
    keyLoading,
    retryToken,
    session?.access_token,
    setRawKey,
    triggerUnlock,
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
        encryptionKey={setupRequested ? encryptionKey : null}
        preparedMethod={preparedMethod}
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
          setPreparedMethod("passkey");
          markProtectionPending(user.id, "passkey");
        }}
        onComplete={async (method) => {
          await setKeyRemembered(true);

          // The Auth client may emit another event when this tab regains focus.
          // Keep the completed setup result from replaying the generated key
          // when that gives us a new `user` object for the same account.
          if (user && setupRef.current?.userId === user.id) {
            setupRef.current = {
              userId: user.id,
              waitingForUnlock: false,
              promise: Promise.resolve({
                key: null,
                error: null,
                preparedMethod: null,
              }),
            };
          }

          setEncryptionKey(null);
          setPreparedMethod(null);
          setSetupRequested(false);
          if (user) markProtectionConfirmed(user.id, method);

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
      <Dialog
        open={setupRequested && !encryptionKey && !setupError && !!session}
        onClose={() => {}}
        size="sm"
      >
        <DialogTitle>Preparing library protection</DialogTitle>
        <DialogDescription>
          FavLock is preparing the encrypted library key on this device.
        </DialogDescription>
      </Dialog>
      <Dialog
        open={setupRequested && !!setupError && !!session}
        onClose={() => {}}
        size="sm"
      >
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
