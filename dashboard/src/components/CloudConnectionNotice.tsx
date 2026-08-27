import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { cloudStatusMessage } from "../lib/cloudAccess";
import { useBrowserOnline } from "../hooks/useBrowserOnline";

export default function CloudConnectionNotice() {
  const online = useBrowserOnline();
  const { user, cloudStatus, retryCloudConnection, connectionError } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user || !cloudStatus || (cloudStatus === "available" && !connectionError) || cloudStatus === "signed_out") return null;
  return (
    <section aria-label="Cloud connection" className="m-3 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] p-4 text-sm lg:mx-0">
      <p role="status">{connectionError || cloudStatusMessage(cloudStatus)}</p>
      {error && <p role="alert" className="mt-2">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        {cloudStatus !== "offline" && <button type="button" disabled={pending} className="underline disabled:opacity-50" onClick={async () => {
          setPending(true);
          setError(null);
          try { await retryCloudConnection(); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "Could not connect. Try again later."); }
          finally { setPending(false); }
        }}>{pending ? "Connecting…" : "Try cloud connection"}</button>}
        {cloudStatus === "reconnect_required" && <Link className="underline" to="/login?reconnect=1">Reconnect account</Link>}
        {online && cloudStatus !== "offline" && <Link className="underline" to="/settings#export-data">Export local data</Link>}
      </div>
    </section>
  );
}
