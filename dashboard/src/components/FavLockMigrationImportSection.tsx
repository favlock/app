import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import {
  clearBookmarkCacheForUser,
  clearLibraryContentCacheForUser,
} from "../lib/bookmarkCache";
import {
  decryptFavLockArchive,
  ENCRYPTED_ARCHIVE_MAX_FILE_BYTES,
  parseEncryptedFavLockArchiveFile,
} from "../lib/encryptedArchive";
import type { FavLockExport } from "../lib/dataExport";
import { importRawKey } from "../lib/encryption";
import {
  parseFavLockExport,
  summarizeFavLockExport,
} from "../lib/favLockExportValidation";
import { migrateFavLockArchive } from "../lib/libraryMigrationApi";
import { clearLocalSearchHistoryForUser } from "../lib/searchHistory";
import { userInfoQueryKey } from "../lib/userInfo";
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
    : "FavLock could not read this archive.";
}

export default function FavLockMigrationImportSection() {
  const { session, user, retryBookmarkCacheSync } = useAuth();
  const { adoptMigratedKey, keyLoading, keyRemembered } = useEncryption();
  const queryClient = useQueryClient();
  const { data: accountPlan, refetch: refetchAccountPlan } = useAccountPlan();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recoveryKeyFileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [sourceKey, setSourceKey] = useState<CryptoKey | null>(null);
  const [archive, setArchive] = useState<FavLockExport | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [rememberWarning, setRememberWarning] = useState(false);
  const [cleanupWarning, setCleanupWarning] = useState(false);
  const summary = archive ? summarizeFavLockExport(archive) : null;

  const resetReview = () => {
    setArchive(null);
    setSourceKey(null);
    setProgress(null);
    setError(null);
    setCompleted(false);
    setRememberWarning(false);
    setCleanupWarning(false);
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    resetReview();
    if (nextFile && nextFile.size > ENCRYPTED_ARCHIVE_MAX_FILE_BYTES) {
      setFile(null);
      setError("The encrypted archive is too large.");
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

  const reviewArchive = async () => {
    if (!file || !recoveryKey.trim()) return;
    setIsReading(true);
    setError(null);
    try {
      const envelope = parseEncryptedFavLockArchiveFile(await file.text());
      const importedKey = await importRawKey(recoveryKey);
      const decrypted = await decryptFavLockArchive(envelope, importedKey);
      setArchive(parseFavLockExport(decrypted));
      setSourceKey(importedKey);
      setRecoveryKey("");
    } catch (reviewError) {
      setArchive(null);
      setError(messageFor(reviewError));
    } finally {
      setIsReading(false);
    }
  };

  const importArchive = async () => {
    if (!archive || !sourceKey) return;
    const accessToken = session?.access_token;
    if (!accessToken) {
      setError("Please sign in again before migrating your data.");
      return;
    }
    setIsMigrating(true);
    setError(null);
    setCompleted(false);
    try {
      const destinationPlan = accountPlan ?? (await refetchAccountPlan()).data;
      if (!destinationPlan) {
        throw new Error("Could not load this account's migration limits.");
      }
      const archiveSummary = summarizeFavLockExport(archive);
      const checks = [
        [
          archiveSummary.bookmarks,
          destinationPlan.limits.bookmarks,
          "bookmarks",
        ],
        [
          archiveSummary.notes + archiveSummary.todos,
          destinationPlan.limits.entries,
          "Documents and Tasks",
        ],
        [
          archiveSummary.readspace,
          destinationPlan.limits.readspace,
          "Readspace items",
        ],
        [
          archiveSummary.collections,
          destinationPlan.limits.collections,
          "Collections",
        ],
        [archiveSummary.tags, destinationPlan.limits.tags, "Tags"],
        [archiveSummary.lists, destinationPlan.limits.lists, "Lists"],
      ] as const;
      const exceeded = checks.find(
        ([count, limit]) => limit > 0 && count > limit,
      );
      if (exceeded) {
        throw new Error(
          `This archive has ${exceeded[0].toLocaleString()} ${exceeded[2]}, but the ${destinationPlan.name} plan allows ${exceeded[1].toLocaleString()}.`,
        );
      }
      await migrateFavLockArchive(
        archive,
        accessToken,
        sourceKey,
        (completedBatches, totalBatches) =>
          setProgress({ completed: completedBatches, total: totalBatches }),
      );
      const keyRememberedAfterMigration = await adoptMigratedKey(sourceKey, {
        rememberDevice: keyRemembered,
      });
      setRememberWarning(keyRemembered && !keyRememberedAfterMigration);
      if (user) {
        clearLocalSearchHistoryForUser(user.id);
        const cleanupResults = await Promise.allSettled([
          clearBookmarkCacheForUser(user.id),
          clearLibraryContentCacheForUser(user.id),
        ]);
        setCleanupWarning(
          cleanupResults.some((result) => result.status === "rejected"),
        );
        void queryClient.invalidateQueries({
          queryKey: userInfoQueryKey(user.id),
        });
      }
      retryBookmarkCacheSync();
      for (const queryKey of [
        ["bookmarks"],
        ["entries"],
        ["folders"],
        ["tags"],
        ["notes"],
        ["todos"],
        ["readspace"],
        ["lists"],
        ["resource-usage"],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      setCompleted(true);
      setArchive(null);
      setSourceKey(null);
      setFile(null);
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (migrationError) {
      setError(messageFor(migrationError));
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <section aria-labelledby="favlock-migration-heading">
      <DataTransferSectionHeader
        id="favlock-migration-heading"
        title="Migrate from FavLock"
        description="Import an encrypted .favlock archive and keep using the recovery key from your original account."
      />

      <div
        className="mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950"
        role="note"
      >
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-5">
          Your recovery key and decrypted data stay in this browser. FavLock
          receives only values protected by that same key.
        </p>
      </div>
      <div
        className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-950"
        role="note"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm leading-5">
          Migration is for a new account with an empty library and Trash.
          Its temporary encryption key is replaced; existing data is never
          overwritten or merged.
        </p>
      </div>

      <div className="mt-5 space-y-5">
        <Field>
          <Label htmlFor="favlock-migration-file">Encrypted archive</Label>
          <Description id="favlock-migration-file-description">
            Select the exported .favlock file.
          </Description>
          <DataTransferFileControl
            id="favlock-migration-file"
            descriptionId="favlock-migration-file-description"
            inputRef={fileInputRef}
            accept=".favlock,application/vnd.favlock.encrypted+json"
            fileName={file?.name ?? null}
            emptyLabel="No archive selected"
            onChange={handleFile}
            disabled={isReading || isMigrating}
            busy={isReading}
            busyLabel="Reading archive..."
          />
        </Field>
        <Field>
          <Label htmlFor="favlock-migration-recovery-key">
            Original recovery key
          </Label>
          <Description id="favlock-migration-recovery-key-description">
            Enter or upload its recovery key.
          </Description>
          <div
            data-slot="control"
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <Input
              id="favlock-migration-recovery-key"
              type="text"
              aria-describedby="favlock-migration-recovery-key-description"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter recovery key"
              value={recoveryKey}
              onChange={(event) => {
                setRecoveryKey(event.target.value);
                resetReview();
              }}
              disabled={isReading || isMigrating}
            />
            <Button
              type="button"
              outline
              disabled={isReading || isMigrating}
              onClick={() => recoveryKeyFileInputRef.current?.click()}
            >
              <Upload aria-hidden="true" />
              Upload key
            </Button>
          </div>
          <input
            ref={recoveryKeyFileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(event) => void handleRecoveryKeyFile(event)}
          />
        </Field>
      </div>

      {!archive ? (
        <DataTransferActionBar>
          <Button
            type="button"
            color="emerald"
            onClick={() => void reviewArchive()}
            disabled={!file || !recoveryKey.trim() || isReading || isMigrating}
          >
            {isReading ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {isReading ? "Checking recovery key..." : "Review archive"}
          </Button>
        </DataTransferActionBar>
      ) : summary ? (
        <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
          <p className="text-sm font-semibold text-gray-900">Ready to migrate</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {Object.entries(summary).map(([label, count]) => (
              <div key={label}>
                <dt className="capitalize text-gray-500">{label}</dt>
                <dd className="font-semibold text-gray-900">{count}</dd>
              </div>
            ))}
          </dl>
          {progress ? (
            <div className="mt-4" role="status">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Preparing encrypted migration</span>
                <span>{progress.completed} / {progress.total}</span>
              </div>
              <progress
                className="mt-2 h-2 w-full accent-[var(--app-primary)]"
                value={progress.completed}
                max={progress.total}
              />
            </div>
          ) : null}
          <DataTransferActionBar className="mt-4">
            <Button
              type="button"
              color="emerald"
              onClick={() => void importArchive()}
              disabled={keyLoading || isMigrating}
            >
              {isMigrating ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              {isMigrating ? "Migrating..." : "Import into this account"}
            </Button>
          </DataTransferActionBar>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {completed ? (
        <div
          className="mt-4 flex items-start gap-2 text-sm text-emerald-700"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Migration complete. Your original recovery key now unlocks this
            account. Create a new passkey in Security &amp; privacy if you want
            passkey unlock.
          </p>
        </div>
      ) : null}
      {rememberWarning ? (
        <p className="mt-3 text-sm text-amber-700" role="alert">
          Migration completed, but this browser could not remember the key.
          Keep the recovery key available for your next unlock.
        </p>
      ) : null}
      {cleanupWarning ? (
        <p className="mt-3 text-sm text-amber-700" role="alert">
          Migration completed, but some temporary local data could not be
          cleared. Clear this site&apos;s data if old content appears.
        </p>
      ) : null}
    </section>
  );
}
