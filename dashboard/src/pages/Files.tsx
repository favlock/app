import {
  Download,
  Eye,
  FileIcon,
  FileText,
  ImageIcon,
  LoaderCircle,
  Menu,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import * as Headless from "@headlessui/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useAccountPlan } from "../hooks/useAccountPlanQuery";
import { useFiles } from "../hooks/useFilesQuery";
import {
  FREE_FILE_MAX_BYTES,
  PRO_FILE_MAX_BYTES,
  decryptFile,
  decryptFileMetadata,
  type FileMetadata,
} from "../lib/fileEncryption";
import { deleteFile, uploadFile } from "../lib/fileRepository";
import { downloadEncryptedFile, type EncryptedFileRecord } from "../lib/filesApi";
import type { DashboardLayoutContext } from "./DashboardLayout";

type DecryptedRecord = EncryptedFileRecord & { metadata: FileMetadata };
type UploadPhase = "encrypting" | "uploading";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function Files() {
  const { setIsMobileSidebarOpen } = useOutletContext<DashboardLayoutContext>();
  const { session, user, isLocalAccount } = useAuth();
  const { cryptoKey, keyLoading, triggerUnlock } = useEncryption();
  const { data: accountPlan } = useAccountPlan();
  const filesQuery = useFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  const operations = useRef(new AbortController());
  const activeTransfer = useRef<AbortSignal | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const downloadUrls = useRef(new Set<string>());
  const previewUrlRef = useRef<string | null>(null);
  const [decryptedFiles, setDecryptedFiles] = useState<DecryptedRecord[]>([]);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadStatus, setUploadStatus] = useState<{
    phase: UploadPhase;
    name: string;
    current: number;
    total: number;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    metadata: FileMetadata;
  } | null>(null);
  const [previewBusyId, setPreviewBusyId] = useState<string | null>(null);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; metadata?: FileMetadata } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!cryptoKey || !filesQuery.data) {
      setDecryptedFiles([]);
      setMetadataError(null);
      return () => { cancelled = true; };
    }
    void Promise.allSettled(
      filesQuery.data.files.map(async (file) => ({
        ...file,
        metadata: await decryptFileMetadata(
          file.encryptedMetadata, cryptoKey, file.id,
        ),
      })),
    ).then((results) => {
      if (!cancelled) {
        setDecryptedFiles(results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        ));
        setMetadataError(results.some((result) => result.status === "rejected")
          ? "Some file details could not be decrypted. Lock and unlock FavLock, then try again."
          : null);
      }
    });
    return () => { cancelled = true; };
  }, [cryptoKey, filesQuery.data]);

  useLayoutEffect(() => {
    const controller = new AbortController();
    operations.current = controller;
    activeTransfer.current = null;
    setTransferBusy(false);
    setPreview(null);
    setDeleteTarget(null);
    setUploadStatus(null);
    setPreviewBusyId(null);
    setDownloadBusyId(null);
    setActionError(null);
    setDeleteBusy(false);
    setDeleteError(null);
    const urls = downloadUrls.current;
    return () => {
      controller.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, [cryptoKey, user?.id]);

  const visibleFiles = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return decryptedFiles;
    return decryptedFiles.filter((file) =>
      file.metadata.name.toLocaleLowerCase().includes(query),
    );
  }, [decryptedFiles, searchQuery]);

  const plaintextLimit = accountPlan?.id === "pro"
    ? PRO_FILE_MAX_BYTES
    : FREE_FILE_MAX_BYTES;
  const busy = uploadStatus !== null;
  const usage = filesQuery.data?.usage;

  const closePreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
  };

  const startTransfer = (signal: AbortSignal) => {
    // The ref closes the same-render double-click window before React commits.
    if (signal.aborted || activeTransfer.current) return false;
    activeTransfer.current = signal;
    setTransferBusy(true);
    return true;
  };
  const finishTransfer = (signal: AbortSignal) => {
    // An old account/key operation must not release a newer operation's slot.
    if (activeTransfer.current !== signal) return;
    activeTransfer.current = null;
    if (!signal.aborted) setTransferBusy(false);
  };

  const loadPlaintext = async (file: DecryptedRecord, signal: AbortSignal) => {
    if (!cryptoKey || !session?.access_token) {
      triggerUnlock();
      throw new Error("Unlock FavLock before opening encrypted files.");
    }
    const ciphertext = await downloadEncryptedFile(session.access_token, file.id, signal);
    signal.throwIfAborted();
    return decryptFile(
      ciphertext,
      file.encryptedMetadata,
      file.wrappedKey,
      cryptoKey,
      file.id,
      signal,
    );
  };

  const handlePreview = async (file: DecryptedRecord) => {
    const signal = operations.current.signal;
    if (!startTransfer(signal)) return;
    setActionError(null);
    setPreviewBusyId(file.id);
    try {
      const decrypted = await loadPlaintext(file, signal);
      signal.throwIfAborted();
      closePreview();
      const url = URL.createObjectURL(decrypted.blob);
      previewUrlRef.current = url;
      setPreview({ url, metadata: decrypted.metadata });
    } catch (error) {
      if (!signal.aborted) setActionError(errorMessage(error, "This file could not be opened."));
    } finally {
      finishTransfer(signal);
      if (!signal.aborted) setPreviewBusyId(null);
    }
  };

  const handleDownload = async (file: DecryptedRecord) => {
    const signal = operations.current.signal;
    if (!startTransfer(signal)) return;
    setActionError(null);
    setDownloadBusyId(file.id);
    try {
      const decrypted = await loadPlaintext(file, signal);
      signal.throwIfAborted();
      const url = URL.createObjectURL(decrypted.blob);
      downloadUrls.current.add(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = decrypted.metadata.name;
      anchor.rel = "noopener";
      anchor.click();
      window.setTimeout(() => {
        if (downloadUrls.current.delete(url)) URL.revokeObjectURL(url);
      }, 60_000);
    } catch (error) {
      if (!signal.aborted) setActionError(errorMessage(error, "This file could not be downloaded."));
    } finally {
      finishTransfer(signal);
      if (!signal.aborted) setDownloadBusyId(null);
    }
  };

  const handleUpload = async (selected: FileList | null) => {
    const signal = operations.current.signal;
    const files = Array.from(selected ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    if (files.length > 10) {
      setActionError("Choose up to 10 files at a time.");
      return;
    }
    if (!cryptoKey || !session?.access_token) {
      triggerUnlock();
      return;
    }
    const tooLarge = files.find((file) => file.size > plaintextLimit);
    if (tooLarge) {
      setActionError(`${tooLarge.name} is larger than your ${formatBytes(plaintextLimit)} per-file limit.`);
      return;
    }
    if (!startTransfer(signal)) return;
    setActionError(null);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        await uploadFile(file, cryptoKey, session.access_token, (phase) => {
          signal.throwIfAborted();
          setUploadStatus({ phase, name: file.name, current: index + 1, total: files.length });
        }, signal);
        signal.throwIfAborted();
      }
      await filesQuery.refetch();
    } catch (error) {
      if (!signal.aborted) {
        setActionError(errorMessage(error, "The encrypted upload could not be completed."));
        await filesQuery.refetch();
      }
    } finally {
      finishTransfer(signal);
      if (!signal.aborted) setUploadStatus(null);
    }
  };

  const confirmDelete = async () => {
    const signal = operations.current.signal;
    if (!deleteTarget || !session?.access_token) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteFile(deleteTarget, session.access_token);
      signal.throwIfAborted();
      setDeleteTarget(null);
      await filesQuery.refetch();
    } catch (error) {
      if (!signal.aborted) setDeleteError(errorMessage(error, "The file could not be deleted."));
    } finally {
      if (!signal.aborted) setDeleteBusy(false);
    }
  };

  if (isLocalAccount) {
    return (
      <div className="w-full min-w-0 flex-1 px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem]">Files</h1>
        <div className="app-surface mt-5 rounded-[1.15rem] p-6 text-center">
          <ShieldCheck className="mx-auto size-8 text-[var(--app-primary)]" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Cloud account required</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--app-muted)]">
            Encrypted Files uses private cloud storage and is not available in a local-only vault.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 flex-1 space-y-4 lg:space-y-5">
      <header className="px-4 pt-4 sm:px-5 lg:px-1 lg:pt-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-1 sm:items-center sm:py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="theme-button-icon -ml-2 inline-flex size-11 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.025em] text-[var(--app-ink)] sm:text-[2rem] sm:leading-tight">Files</h1>
              <p className="mt-1 text-sm text-[var(--app-muted)] sm:text-[0.95rem]">
                Private PDFs and images, encrypted before upload
              </p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => void handleUpload(event.target.files)}
          />
          <Button
            type="button"
            color="emerald"
            className="min-h-11 whitespace-nowrap"
            disabled={transferBusy || keyLoading || !accountPlan || filesQuery.isLoading}
            onClick={() => {
              if (!cryptoKey) triggerUnlock();
              else inputRef.current?.click();
            }}
          >
            {busy ? <LoaderCircle data-slot="icon" className="animate-spin" aria-hidden="true" /> : <Upload data-slot="icon" aria-hidden="true" />}
            <span className="hidden sm:inline">Upload files</span>
            <span className="sm:hidden">Upload</span>
          </Button>
        </div>
      </header>

      <section className="px-3 lg:px-0">
        <div className="app-surface rounded-[1.15rem] p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block min-w-0 flex-1 sm:max-w-md">
              <span className="sr-only">Search files by name</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--app-muted)]" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search filenames"
                className="min-h-11 w-full rounded-xl border border-[color-mix(in_oklab,var(--app-line)_14%,transparent)] bg-[var(--app-highlight)] pl-10 pr-3 text-sm text-[var(--app-ink)] placeholder:text-[var(--app-muted)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--app-primary)]"
              />
            </label>
            <p className="text-xs text-[var(--app-muted)]">
              {usage ? `${formatBytes(usage.usedBytes)} of ${formatBytes(usage.limitBytes)} used` : `Up to ${formatBytes(plaintextLimit)} per file`}
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] bg-[var(--app-highlight)] px-3 py-2.5 text-xs text-[var(--app-muted)]">
            FavLock can decrypt files only while this vault is unlocked. A downloaded copy is no longer protected by FavLock.
          </div>

          {uploadStatus ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[color-mix(in_oklab,var(--app-primary)_9%,transparent)] px-3 py-2.5 text-sm" role="status" aria-live="polite">
              <LoaderCircle className="size-4 animate-spin text-[var(--app-primary)]" aria-hidden="true" />
              <span className="truncate">
                {uploadStatus.phase === "encrypting" ? "Encrypting" : "Uploading"} {uploadStatus.name} · {uploadStatus.current}/{uploadStatus.total}
              </span>
            </div>
          ) : null}

          {actionError || metadataError ? (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300" role="alert">
              <span>{actionError ?? metadataError}</span>
              <button type="button" className="shrink-0" aria-label="Dismiss error" onClick={() => { setActionError(null); setMetadataError(null); }}><X className="size-4" aria-hidden="true" /></button>
            </div>
          ) : null}

          {(filesQuery.data?.pendingFiles?.length ?? 0) > 0 ? (
            <section className="mt-4 rounded-xl border border-[var(--app-line)] p-3" aria-label="Unfinished uploads">
              <h2 className="text-sm font-semibold">Unfinished uploads</h2>
              <p className="mt-1 text-xs text-[var(--app-muted)]">These uploads still reserve storage. Cancel an interrupted upload to free its space, then upload the file again.</p>
              <ul className="mt-2 space-y-2">
                {filesQuery.data?.pendingFiles.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>Unfinished upload · {formatBytes(file.ciphertextBytes)}</span>
                    <Button type="button" outline onClick={() => { setDeleteError(null); setDeleteTarget({ id: file.id }); }}>Cancel upload</Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {filesQuery.isLoading || (filesQuery.data && !cryptoKey) ? (
            <div className="flex min-h-52 items-center justify-center text-sm text-[var(--app-muted)]" role="status">
              {cryptoKey ? "Loading encrypted files..." : "Unlock FavLock to view file details."}
            </div>
          ) : filesQuery.error ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-[var(--app-muted)]">Could not load encrypted files.</p>
              <Button type="button" outline onClick={() => void filesQuery.refetch()}>Try again</Button>
            </div>
          ) : visibleFiles.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
              <ShieldCheck className="size-9 text-[var(--app-primary)]" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">{searchQuery ? "No matching files" : "Your encrypted file space is ready"}</h2>
              <p className="mt-1 max-w-md text-sm text-[var(--app-muted)]">
                {searchQuery ? "Try a different filename." : "Upload a PDF or image. Its name, type, and contents are encrypted on this device first."}
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[color-mix(in_oklab,var(--app-line)_10%,transparent)]" aria-label="Encrypted files">
              {visibleFiles.map((file) => {
                const isPdf = file.metadata.mimeType === "application/pdf";
                const Icon = isPdf ? FileText : ImageIcon;
                return (
                  <li key={file.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--app-highlight)] text-[var(--app-primary)]">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--app-ink)]">{file.metadata.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--app-muted)]">{isPdf ? "PDF" : file.metadata.mimeType.replace("image/", "").toUpperCase()} · {formatBytes(file.metadata.size)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" className="theme-button-icon inline-flex size-10" aria-label={`Preview ${file.metadata.name}`} disabled={transferBusy} onClick={() => void handlePreview(file)}>
                        {previewBusyId === file.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                      </button>
                      <button type="button" className="theme-button-icon inline-flex size-10" aria-label={`Download ${file.metadata.name}`} disabled={transferBusy} onClick={() => void handleDownload(file)}>
                        {downloadBusyId === file.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                      </button>
                      <button type="button" className="theme-button-icon inline-flex size-10 text-red-600 dark:text-red-300" aria-label={`Permanently delete ${file.metadata.name}`} onClick={() => { setDeleteError(null); setDeleteTarget(file); }}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {preview && cryptoKey ? (
        <Headless.Dialog open onClose={closePreview} className="relative z-[70]">
          <Headless.DialogBackdrop className="fixed inset-0 bg-black/70" />
          <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6">
          <Headless.DialogPanel className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[var(--app-bg)] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[color-mix(in_oklab,var(--app-line)_12%,transparent)] px-4 py-3">
              <Headless.DialogTitle className="flex min-w-0 items-center gap-2"><FileIcon className="size-4 shrink-0" aria-hidden="true" /><span className="truncate text-sm font-semibold">{preview.metadata.name}</span></Headless.DialogTitle>
              <button type="button" className="theme-button-icon inline-flex size-10" aria-label="Close preview" onClick={closePreview}><X className="size-5" aria-hidden="true" /></button>
            </div>
            <div className="min-h-0 flex-1 bg-black/5 p-2 sm:p-4">
              {preview.metadata.mimeType === "application/pdf" ? (
                <iframe src={preview.url} title={preview.metadata.name} sandbox="" className="h-full w-full rounded-lg bg-white" />
              ) : (
                <img src={preview.url} alt={preview.metadata.name} className="h-full w-full object-contain" />
              )}
            </div>
          </Headless.DialogPanel>
          </div>
        </Headless.Dialog>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Permanently delete file?"
        description={deleteTarget?.metadata ? `${deleteTarget.metadata.name} will be removed from encrypted storage immediately. This cannot be undone.` : "This file will be permanently deleted."}
        confirmLabel="Delete permanently"
        busyLabel="Deleting..."
        busy={deleteBusy}
        error={deleteError}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
