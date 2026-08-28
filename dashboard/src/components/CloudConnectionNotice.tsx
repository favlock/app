import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { cloudStatusMessage } from "../lib/cloudAccess";
import { useBrowserOnline } from "../hooks/useBrowserOnline";

interface ConnectionAttempt {
  scope: object;
  pending: boolean;
  error: string | null;
}

export default function CloudConnectionNotice() {
  const online = useBrowserOnline();
  const { user, session, cloudStatus, retryCloudConnection, connectionError } = useAuth();
  const scope = useMemo(
    () => ({ userId: user?.id, accessToken: session?.access_token, cloudStatus }),
    [user?.id, session?.access_token, cloudStatus],
  );
  const [attempt, setAttempt] = useState<ConnectionAttempt | null>(null);
  const currentAttempt = attempt?.scope === scope ? attempt : null;
  const pending = currentAttempt?.pending ?? false;
  const error = currentAttempt?.error;
  if (!user || !cloudStatus || (cloudStatus === "available" && !connectionError) || cloudStatus === "signed_out") return null;
  return (
    <section aria-label="Cloud connection" className="m-3 rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] p-4 text-sm lg:mx-0">
      <p role="status">{connectionError || cloudStatusMessage(cloudStatus)}</p>
      {error && <p role="alert" className="mt-2">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        {cloudStatus !== "offline" && <button type="button" disabled={pending} className="underline disabled:opacity-50" onClick={async () => {
          const nextAttempt: ConnectionAttempt = { scope, pending: true, error: null };
          setAttempt(nextAttempt);
          try {
            await retryCloudConnection();
            setAttempt((current) => current === nextAttempt ? null : current);
          } catch (failure) {
            const message = failure instanceof Error ? failure.message : "Could not connect. Try again later.";
            setAttempt((current) => current === nextAttempt ? { scope, pending: false, error: message } : current);
          }
        }}>{pending ? "Connecting…" : "Try cloud connection"}</button>}
        {cloudStatus === "reconnect_required" && <Link className="underline" to="/login?reconnect=1">Reconnect account</Link>}
        {online && cloudStatus !== "offline" && <Link className="underline" to="/settings#export-data">Export local data</Link>}
      </div>
    </section>
  );
}
