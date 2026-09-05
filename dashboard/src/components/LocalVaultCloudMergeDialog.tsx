import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudUpload, HardDrive, KeyRound, LoaderCircle } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { getProfileNamesFromUser } from "../lib/auth";
import { encryptField, exportRawKey, formatEncryptionKey, importRawKey, VERIFY_CONSTANT } from "../lib/encryption";
import { saveEncryptionVerifier } from "../lib/encryptionMetadataApi";
import { clearLocalKeyVerifier, matchesLocalKey } from "../lib/localKeyVerifier";
import { clearLocalVault, readLocalPasskeyRecord } from "../lib/localVault";
import { carryLocalOnboardingProgress } from "../lib/onboarding";
import {
  buildLocalVaultMergeArchive,
  clearLocalVaultCloudMerge,
  inspectLocalVaultCloudDestination,
  markLocalVaultCloudMergeAdopting,
  markLocalVaultCloudMergeCompleted,
  readLocalVaultCloudMerge,
  type LocalVaultCloudMergeIntent,
} from "../lib/localVaultCloudMerge";
import { mergeFavLockArchive, migrateFavLockArchive } from "../lib/libraryMigrationApi";
import {
  createPasskeyEncryptionRecord,
  savePasskeyEncryptionRecord,
  unwrapEncryptionKeyWithPasskey,
} from "../lib/passkeyEncryption";
import { Button } from "./ui/button";
import { Description, Field, Label } from "./ui/fieldset";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The local vault could not be merged.";
}

function countArchiveItems(archive: Awaited<ReturnType<typeof buildLocalVaultMergeArchive>>): number {
  return archive.data.collections.length +
    archive.data.tags.length +
    (archive.data.bookmarks?.length ?? 0) +
    (archive.data.lists?.length ?? 0) +
    (archive.data.lists ?? []).reduce((count, list) => count + list.items.length, 0) +
    (archive.data.notes?.length ?? 0) +
    (archive.data.todos?.length ?? 0) +
    (archive.data.readspace?.length ?? 0);
}

export default function LocalVaultCloudMergeDialog() {
  const { session, user, isLocalAccount, retryBookmarkCacheSync } = useAuth();
  const { adoptMigratedKey, cryptoKey, setRawKey, triggerUnlock } = useEncryption();
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<LocalVaultCloudMergeIntent | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [completed, setCompleted] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [hasLocalPasskey, setHasLocalPasskey] = useState(false);
  const [adoptedLocalKey, setAdoptedLocalKey] = useState(false);
  const [savingPasskey, setSavingPasskey] = useState(false);
  const [passkeyCreated, setPasskeyCreated] = useState(false);

  useEffect(() => {
    if (!user || isLocalAccount) return;
    const nextIntent = readLocalVaultCloudMerge();
    setIntent(nextIntent);
    if (!nextIntent) return;
    if (nextIntent.completed) {
      setAdoptedLocalKey(nextIntent.adoptedLocalKey === true);
      setCompleted(true);
    }
    let active = true;
    void readLocalPasskeyRecord(nextIntent.sourceVaultId)
      .then((record) => { if (active) setHasLocalPasskey(!!record); })
      .catch(() => { if (active) setHasLocalPasskey(false); });
    return () => { active = false; };
  }, [isLocalAccount, user]);

  if (!intent || !user || isLocalAccount || !session?.access_token) {
    return null;
  }

  const finish = () => {
    clearLocalVaultCloudMerge();
    setIntent(null);
  };

  const defer = () => {
    setIntent(null);
  };

  const mergeWithKey = async (sourceKey: CryptoKey) => {
    setMerging(true);
    setError(null);
    setProgress(null);
    try {
      let didAdoptLocalKey = false;
      if (!await matchesLocalKey(intent.sourceVaultId, sourceKey)) {
        throw new Error("This recovery key does not unlock the local vault.");
      }
      const archive = await buildLocalVaultMergeArchive(
        intent.sourceVaultId,
        sourceKey,
      );
      const itemCount = countArchiveItems(archive);
      const destination = await inspectLocalVaultCloudDestination(
        sourceKey,
        session.access_token,
      );
      const onProgress = (batchCompleted: number, total: number) =>
        setProgress({ completed: batchCompleted, total });

      if (destination === "different-key") {
        if (!cryptoKey) {
          triggerUnlock();
          throw new Error(
            "This account already has a different encrypted vault. Unlock the cloud vault, then enter the local recovery key again to merge both vaults.",
          );
        }
        if (itemCount === 0) {
          throw new Error("The local vault has no data to merge into this account.");
        }
        await mergeFavLockArchive(
          archive,
          session.access_token,
          cryptoKey,
          onProgress,
          intent.migrationId,
        );
      } else if (destination === "empty") {
        const updatedIntent = markLocalVaultCloudMergeAdopting(intent);
        setIntent(updatedIntent);
        if (itemCount > 0) {
          await migrateFavLockArchive(
            archive,
            session.access_token,
            sourceKey,
            onProgress,
            intent.migrationId,
          );
          await adoptMigratedKey(sourceKey, { rememberDevice: true });
        } else {
          await setRawKey(formatEncryptionKey(await exportRawKey(sourceKey)), {
            rememberDevice: true,
          });
        }
        setAdoptedLocalKey(true);
        didAdoptLocalKey = true;
      } else {
        if (itemCount > 0) {
          await mergeFavLockArchive(
            archive,
            session.access_token,
            sourceKey,
            onProgress,
            intent.migrationId,
          );
        }
        if (destination === "same-key-without-verifier") {
          await saveEncryptionVerifier(
            session.access_token,
            await encryptField(VERIFY_CONSTANT, sourceKey),
          );
        }
        await adoptMigratedKey(sourceKey, { rememberDevice: true });
        if (intent.strategy === "adopt-local-key") {
          setAdoptedLocalKey(true);
          didAdoptLocalKey = true;
        }
      }
      carryLocalOnboardingProgress(intent.sourceVaultId, user.id);
      setIntent(markLocalVaultCloudMergeCompleted(intent, didAdoptLocalKey));
      setRecoveryKey("");
      setCompleted(true);
      retryBookmarkCacheSync();
      for (const queryKey of [
        ["bookmarks"], ["folders"], ["tags"], ["lists"], ["entries"],
        ["notes"], ["todos"], ["readspace"], ["resource-usage"],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    } catch (caughtError) {
      setError(messageFor(caughtError));
    } finally {
      setMerging(false);
    }
  };

  const createCloudPasskey = async () => {
    if (!cryptoKey || savingPasskey) return;
    setSavingPasskey(true);
    setError(null);
    try {
      const { firstName, lastName } = getProfileNamesFromUser(user);
      const displayName =
        [firstName, lastName].filter(Boolean).join(" ") ||
        user.email ||
        "FavLock user";
      const record = await createPasskeyEncryptionRecord({
        rawKey: await exportRawKey(cryptoKey),
        userId: user.id,
        userName: user.email || user.id,
        displayName,
      });
      await savePasskeyEncryptionRecord(session.access_token, record);
      setPasskeyCreated(true);
    } catch (caughtError) {
      setError(messageFor(caughtError));
    } finally {
      setSavingPasskey(false);
    }
  };

  const mergeWithRecoveryKey = async () => {
    if (!recoveryKey.trim() || merging) return;
    try {
      await mergeWithKey(await importRawKey(recoveryKey));
    } catch (caughtError) {
      setError(messageFor(caughtError));
    }
  };

  const mergeWithPasskey = async () => {
    if (merging) return;
    setMerging(true);
    setError(null);
    try {
      const record = await readLocalPasskeyRecord(intent.sourceVaultId);
      if (!record) throw new Error("This local vault has no saved passkey.");
      const rawKey = await unwrapEncryptionKeyWithPasskey(
        record,
        intent.sourceVaultId,
      );
      await mergeWithKey(await importRawKey(rawKey));
    } catch (caughtError) {
      setError(messageFor(caughtError));
      setMerging(false);
    }
  };

  const removeLocalCopy = async () => {
    setRemoving(true);
    setError(null);
    try {
      await clearLocalVault(intent.sourceVaultId);
      clearLocalKeyVerifier(intent.sourceVaultId);
      finish();
    } catch (caughtError) {
      setError(messageFor(caughtError));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open onClose={completed ? () => undefined : defer} size="lg">
      <DialogTitle>{completed ? "Local vault connected" : "Connect local vault"}</DialogTitle>
      <DialogDescription>
        {completed
          ? adoptedLocalKey
            ? "This account now uses the same encryption and recovery key as your local vault."
            : "Your encrypted local data is now part of this cloud account."
          : "An empty account will adopt this vault's key. An existing vault keeps its current key and receives encrypted copies of local items."}
      </DialogDescription>
      <DialogBody>
        {completed ? (
          <>
            <div className="rounded-xl border border-emerald-600/20 bg-emerald-500/10 p-4">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div className="text-sm leading-6 text-emerald-950">
                  <p className="font-semibold">Cloud synchronization is ready.</p>
                  <p>
                    The original encrypted local copy is still stored in this browser.
                    You can keep it as a fallback or remove it now.
                  </p>
                  {adoptedLocalKey && (
                    <p className="mt-2">
                      Your existing local recovery key remains valid for this cloud vault.
                    </p>
                  )}
                </div>
              </div>
            </div>
            {adoptedLocalKey && !passkeyCreated && (
              <div className="mt-4 rounded-xl border border-sky-600/20 bg-sky-500/8 p-4">
                <p className="text-sm font-semibold text-sky-950">Create a cloud passkey</p>
                <p className="mt-1 text-sm leading-6 text-sky-900">
                  Create a new passkey for this account. It will unlock the same migrated vault key; the local passkey itself is not transferred.
                </p>
                <Button
                  type="button"
                  color="emerald"
                  className="mt-3"
                  disabled={savingPasskey || !cryptoKey}
                  onClick={() => void createCloudPasskey()}
                >
                  {savingPasskey ? <LoaderCircle data-slot="icon" className="animate-spin" aria-hidden="true" /> : <KeyRound data-slot="icon" aria-hidden="true" />}
                  {savingPasskey ? "Creating passkey…" : "Create cloud passkey"}
                </Button>
              </div>
            )}
            {adoptedLocalKey && passkeyCreated && (
              <p className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800" role="status">
                Cloud passkey created. It protects the same migrated vault key.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="rounded-xl border border-sky-600/20 bg-sky-500/8 p-4">
              <div className="flex gap-3">
                <CloudUpload className="mt-0.5 size-5 shrink-0 text-sky-700" aria-hidden="true" />
                <p className="text-sm leading-6 text-sky-950">
                  FavLock first checks the encrypted destination. An empty account
                  adopts the local vault key. If this account already has a vault,
                  local records are decrypted only here, encrypted with that
                  vault&apos;s key, and uploaded as ciphertext. Duplicate bookmarks
                  are kept. You are connecting to <strong>{user.email || "this account"}</strong>.
                </p>
              </div>
            </div>
            <Field className="mt-5">
              <Label htmlFor="local-merge-recovery-key">Local recovery key</Label>
              <Description id="local-merge-recovery-key-description">
                Enter the recovery key created for the local vault. It is never sent to FavLock.
              </Description>
              <Input
                id="local-merge-recovery-key"
                aria-describedby="local-merge-recovery-key-description"
                className="mt-2"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={recoveryKey}
                disabled={merging}
                onChange={(event) => setRecoveryKey(event.target.value)}
              />
            </Field>
            {hasLocalPasskey && (
              <Button
                type="button"
                outline
                className="mt-3 w-full"
                disabled={merging}
                onClick={() => void mergeWithPasskey()}
              >
                Unlock local vault with passkey
              </Button>
            )}
            {progress && (
              <p className="mt-4 text-sm text-zinc-600" role="status">
                Uploaded encrypted batch {progress.completed} of {progress.total}…
              </p>
            )}
          </>
        )}
        {error && (
          <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogActions>
        {completed ? (
          <>
            <Button type="button" outline disabled={removing} onClick={() => void removeLocalCopy()}>
              <HardDrive data-slot="icon" aria-hidden="true" />
              {removing ? "Removing…" : "Remove local copy"}
            </Button>
            <Button type="button" color="emerald" disabled={removing} onClick={finish}>
              Keep local copy
            </Button>
          </>
        ) : (
          <>
            <Button type="button" plain disabled={merging} onClick={defer}>
              Do this later
            </Button>
            <Button
              type="button"
              color="emerald"
              disabled={merging || !recoveryKey.trim()}
              onClick={() => void mergeWithRecoveryKey()}
            >
              {merging ? <LoaderCircle data-slot="icon" className="animate-spin" aria-hidden="true" /> : <CloudUpload data-slot="icon" aria-hidden="true" />}
              {merging ? "Connecting encrypted vault…" : "Connect to this account"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
