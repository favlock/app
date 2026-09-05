import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, LoaderCircle, ShieldCheck, Upload } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import {
  decryptFavLockArchive,
  ENCRYPTED_ARCHIVE_MAX_FILE_BYTES,
  parseEncryptedFavLockArchiveFile,
} from "../lib/encryptedArchive";
import { importRawKey } from "../lib/encryption";
import {
  parseFavLockExport,
  summarizeFavLockExport,
} from "../lib/favLockExportValidation";
import {
  hasLocalVaultContent,
  LOCAL_BOOKMARK_LIMIT,
  LOCAL_ENTRY_LIMIT,
  LOCAL_LIST_LIMIT,
  restoreLocalVaultFromExport,
} from "../lib/localVault";
import { setLibraryPopulated } from "../lib/onboarding";
import type { FavLockExport } from "../lib/dataExport";
import { Button } from "./ui/button";
import { Description, Field, Label } from "./ui/fieldset";
import { Input } from "./ui/input";
import {
  DataTransferActionBar,
  DataTransferFileControl,
  DataTransferSectionHeader,
} from "./DataTransferControls";

function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "FavLock could not read this backup.";
}

export default function LocalVaultRestoreSection() {
  const { user, isLocalAccount, retryBookmarkCacheSync } = useAuth();
  const { cryptoKey } = useEncryption();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recoveryKeyFileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [archive, setArchive] = useState<FavLockExport | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const summary = archive ? summarizeFavLockExport(archive) : null;

  const resetReview = () => {
    setArchive(null);
    setError(null);
    setCompleted(false);
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    resetReview();
    if (nextFile && nextFile.size > ENCRYPTED_ARCHIVE_MAX_FILE_BYTES) {
      setFile(null);
      setError("The encrypted backup is too large.");
      event.target.value = "";
      return;
    }
    setFile(nextFile);
  };

  const handleRecoveryKeyFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const keyFile = event.target.files?.[0];
    event.target.value = "";
    if (!keyFile) return;
    if (keyFile.size > 16 * 1024) {
      resetReview();
      setError("The recovery key file is too large.");
      return;
    }
    try {
      setRecoveryKey((await keyFile.text()).trim());
      resetReview();
    } catch {
      resetReview();
      setError("FavLock could not read the recovery key file.");
    }
  };

  const reviewBackup = async () => {
    if (!file || !recoveryKey.trim() || !user || !isLocalAccount) return;
    setIsReading(true);
    setError(null);
    try {
      if (await hasLocalVaultContent(user.id)) {
        throw new Error(
          "Restore is available only for an empty local vault. Back up or remove its current data first.",
        );
      }
      const envelope = parseEncryptedFavLockArchiveFile(await file.text());
      const importedKey = await importRawKey(recoveryKey);
      const parsed = parseFavLockExport(
        await decryptFavLockArchive(envelope, importedKey),
      );
      const parsedSummary = summarizeFavLockExport(parsed);
      if (parsedSummary.bookmarks > LOCAL_BOOKMARK_LIMIT) {
        throw new Error(
          `This backup has ${parsedSummary.bookmarks.toLocaleString()} bookmarks, but a local vault allows ${LOCAL_BOOKMARK_LIMIT.toLocaleString()}.`,
        );
      }
      if (parsedSummary.notes + parsedSummary.todos > LOCAL_ENTRY_LIMIT) {
        throw new Error(
          `This backup has ${(parsedSummary.notes + parsedSummary.todos).toLocaleString()} Documents and Tasks, but a local vault allows ${LOCAL_ENTRY_LIMIT.toLocaleString()} combined.`,
        );
      }
      if (LOCAL_LIST_LIMIT > 0 && parsedSummary.lists > LOCAL_LIST_LIMIT) {
        throw new Error(
          `This backup has ${parsedSummary.lists.toLocaleString()} Lists, but a local vault allows ${LOCAL_LIST_LIMIT.toLocaleString()}.`,
        );
      }
      if (
        parsed.data.bookmarks?.some(
          (bookmark) => bookmark.collectionIds.length > 1,
        )
      ) {
        throw new Error(
          "This backup contains bookmarks in multiple Collections, which the local vault cannot restore yet.",
        );
      }
      setArchive(parsed);
      setRecoveryKey("");
    } catch (reviewError) {
      setArchive(null);
      setError(messageFor(reviewError));
    } finally {
      setIsReading(false);
    }
  };

  const restoreBackup = async () => {
    if (!archive || !user || !isLocalAccount) return;
    setIsRestoring(true);
    setError(null);
    setCompleted(false);
    try {
      if (!cryptoKey) {
        throw new Error(
          "Unlock this local vault before restoring the backup.",
        );
      }
      if (await hasLocalVaultContent(user.id)) {
        throw new Error(
          "Restore stopped because this local vault is no longer empty.",
        );
      }
      await restoreLocalVaultFromExport(user.id, archive, cryptoKey);
      setLibraryPopulated(
        user.id,
        (archive.data.bookmarks?.length ?? 0) +
          (archive.data.notes?.length ?? 0) +
          (archive.data.todos?.length ?? 0) > 0,
      );
      retryBookmarkCacheSync();
      for (const queryKey of [
        ["bookmarks"],
        ["folders"],
        ["tags"],
        ["notes"],
        ["todos"],
        ["lists"],
        ["entries"],
        ["resource-usage"],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      setCompleted(true);
      setArchive(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (restoreError) {
      setError(messageFor(restoreError));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <section aria-labelledby="local-vault-restore-heading">
      <DataTransferSectionHeader
        id="local-vault-restore-heading"
        title="Restore local backup"
        description="Restore bookmarks, Lists, Documents, Tasks, Collections, and Tags from an encrypted .favlock backup. Readspace and highlights are not restored to local vaults."
      />

      <div className="mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950" role="note">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-5">
          The file is decrypted only in this browser. Its recovery key opens
          the backup and is never sent to FavLock.
        </p>
      </div>
      <div className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-950" role="note">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-5">
          Restore requires an empty local vault. Restored data uses this
          vault&apos;s existing encryption key, recovery key, and passkey.
        </p>
      </div>

      <div className="mt-5 space-y-5">
        <Field>
          <Label htmlFor="local-vault-backup-file">Encrypted backup</Label>
          <Description id="local-vault-backup-file-description">
            Select a FavLock .favlock file.
          </Description>
          <DataTransferFileControl
            id="local-vault-backup-file"
            descriptionId="local-vault-backup-file-description"
            inputRef={fileInputRef}
            accept=".favlock,application/vnd.favlock.encrypted+json"
            fileName={file?.name ?? null}
            emptyLabel="No backup selected"
            onChange={handleFile}
            disabled={isReading || isRestoring}
            busy={isReading}
            busyLabel="Reading backup..."
          />
        </Field>
        <Field>
          <Label htmlFor="local-vault-recovery-key">Backup recovery key</Label>
          <Description id="local-vault-recovery-key-description">
            Enter the recovery key used when this backup was created.
          </Description>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="local-vault-recovery-key"
              aria-describedby="local-vault-recovery-key-description"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={recoveryKey}
              onChange={(event) => {
                setRecoveryKey(event.target.value);
                resetReview();
              }}
              disabled={isReading || isRestoring}
            />
            <Button
              type="button"
              outline
              onClick={() => recoveryKeyFileInputRef.current?.click()}
              disabled={isReading || isRestoring}
            >
              Upload key file
            </Button>
            <input
              ref={recoveryKeyFileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="sr-only"
              onChange={(event) => void handleRecoveryKeyFile(event)}
            />
          </div>
        </Field>
      </div>

      {!archive ? (
        <DataTransferActionBar>
          <Button
            type="button"
            color="emerald"
            onClick={() => void reviewBackup()}
            disabled={!file || !recoveryKey.trim() || isReading || isRestoring}
          >
            {isReading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {isReading ? "Checking recovery key..." : "Review backup"}
          </Button>
        </DataTransferActionBar>
      ) : summary ? (
        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
          <p className="text-sm font-semibold text-gray-900">Ready to restore</p>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            {(["bookmarks", "collections", "tags"] as const).map((kind) => (
              <div key={kind}>
                <dt className="capitalize text-gray-500">{kind}</dt>
                <dd className="font-semibold text-gray-900">{summary[kind].toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <DataTransferActionBar className="mt-4">
            <Button
              type="button"
              color="emerald"
              onClick={() => void restoreBackup()}
              disabled={isRestoring}
            >
              {isRestoring ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {isRestoring ? "Restoring..." : "Restore into this vault"}
            </Button>
          </DataTransferActionBar>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {completed ? (
        <div className="mt-4 flex items-start gap-2 text-sm text-emerald-700" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>Backup restored. Your existing local key and passkey still protect this vault.</p>
        </div>
      ) : null}
    </section>
  );
}
