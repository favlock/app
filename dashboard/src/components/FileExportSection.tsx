import { useLayoutEffect, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useEncryption } from "../context/useEncryption";
import { useBrowserOnline } from "../hooks/useBrowserOnline";
import { isBrowserOnline, OFFLINE_EXPORT_MESSAGE } from "../lib/network";
import { buildFileExportPart, loadFileExportPlan, type FileExportPlan } from "../lib/fileExport";
import { Button } from "./ui/button";
import { DataTransferActionBar, DataTransferSectionHeader } from "./DataTransferControls";

export default function FileExportSection() {
  const { session, user, isLocalAccount } = useAuth();
  const { cryptoKey, keyLoading, triggerUnlock } = useEncryption();
  const online = useBrowserOnline();
  const operation = useRef<AbortController | null>(null);
  const readyUrl = useRef<string | null>(null);
  const [plan, setPlan] = useState<FileExportPlan | null>(null);
  const [partIndex, setPartIndex] = useState(0);
  const [ready, setReady] = useState<string | null>(null);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearDownload() {
    if (readyUrl.current) URL.revokeObjectURL(readyUrl.current);
    readyUrl.current = null;
    setReady(null);
    setDownloadRequested(false);
  }

  useLayoutEffect(() => {
    setPlan(null); setPartIndex(0); setBusy(false); setProgress(null); setError(null);
    setReady(null); setDownloadRequested(false);
    return () => {
      operation.current?.abort(); operation.current = null;
      if (readyUrl.current) URL.revokeObjectURL(readyUrl.current);
      readyUrl.current = null;
    };
  }, [cryptoKey, user?.id, isLocalAccount, online]);

  async function prepare(index?: number) {
    if (operation.current || !isBrowserOnline() || isLocalAccount) return;
    if (!cryptoKey) { triggerUnlock(); return; }
    if (!session?.access_token || !user?.id) { setError("Reconnect to export your files."); return; }
    const controller = new AbortController();
    operation.current = controller;
    const { signal } = controller;
    setBusy(true); setError(null); setProgress(index === undefined ? "Checking files…" : "Preparing ZIP…");
    clearDownload();
    try {
      if (index === undefined) {
        const nextPlan = await loadFileExportPlan(session.access_token, signal);
        signal.throwIfAborted();
        setPlan(nextPlan); setPartIndex(0);
      } else if (plan) {
        setPartIndex(index);
        const blob = await buildFileExportPart(plan, index, cryptoKey, session.access_token, signal, (done, total) => {
          signal.throwIfAborted();
          setProgress(`Preparing file ${Math.min(done + 1, total)} of ${total}…`);
        });
        signal.throwIfAborted();
        if (!isBrowserOnline()) throw new Error(OFFLINE_EXPORT_MESSAGE);
        const url = URL.createObjectURL(blob);
        readyUrl.current = url;
        setReady(url);
      }
    } catch {
      if (!signal.aborted) setError("This export could not be prepared. Retry this part, or check files again if your library changed.");
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false); setProgress(null);
      }
    }
  }

  function cancel() {
    operation.current?.abort(); operation.current = null;
    setBusy(false); setProgress(null); setError(null);
    clearDownload();
  }

  if (isLocalAccount) return null;
  return (
    <section aria-labelledby="file-export-heading" className="mt-8 border-t border-gray-200 pt-6 dark:border-[var(--app-line)]/20">
      <DataTransferSectionHeader id="file-export-heading" title="Export files"
        description="Download your original files as ZIPs. Files are exported separately from the encrypted library archive." />
      <p role="note" className="mt-3 text-sm text-amber-800 dark:text-amber-200">
        These ZIPs are not encrypted. Anyone with a downloaded ZIP can read its files.
        Large exports are split into smaller ZIP parts.
      </p>
      {!online ? <p role="status" className="mt-4 text-sm">{OFFLINE_EXPORT_MESSAGE}</p> : <>
        {plan && <div className="mt-4 text-sm text-gray-600 dark:text-[var(--app-muted)]">
          <p role="status">{plan.fileCount === 0 ? "No completed files to export." : `${plan.fileCount} ${plan.fileCount === 1 ? "file" : "files"} in ${plan.parts.length} ZIP ${plan.parts.length === 1 ? "part" : "parts"}.`}</p>
          {plan.pendingCount > 0 && <p role="note" className="mt-2 text-amber-800 dark:text-amber-200">
            {plan.pendingCount} unfinished {plan.pendingCount === 1 ? "upload is" : "uploads are"} excluded. Manage unfinished uploads in Files, then check files again.
          </p>}
          {downloadRequested && <p className="mt-2">Check that this ZIP has finished saving before preparing another part.</p>}
        </div>}
        {progress && <p role="status" className="mt-4 text-sm">{progress}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-300">{error}</p>}
        <DataTransferActionBar>
          {busy ? <Button outline type="button" onClick={cancel}>Cancel file export</Button> : <Button outline type="button" disabled={keyLoading} onClick={() => { void prepare(); }}>
            {!cryptoKey ? "Unlock to export files" : plan ? "Check files again" : "Check files for export"}
          </Button>}
          {!busy && plan && plan.parts.length > 0 && !ready && <Button color="emerald" type="button" onClick={() => { void prepare(partIndex); }}>
            Prepare part {partIndex + 1} of {plan.parts.length}
          </Button>}
          {busy && <span className="inline-flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Preparing files</span>}
          {ready && plan && <Button color="emerald" href={ready}
            download={`favlock-files-${plan.exportedAt.slice(0, 10)}-part-${partIndex + 1}-of-${plan.parts.length}.zip`}
            onClick={(event) => {
              if (!cryptoKey || !isBrowserOnline()) { event.preventDefault(); return; }
              setDownloadRequested(true);
            }}>
            <Download className="size-4" aria-hidden="true" />Download part {partIndex + 1} ZIP
          </Button>}
          {ready && downloadRequested && plan && partIndex + 1 < plan.parts.length && <Button outline type="button" onClick={() => { void prepare(partIndex + 1); }}>
            Prepare next part
          </Button>}
        </DataTransferActionBar>
      </>}
    </section>
  );
}
