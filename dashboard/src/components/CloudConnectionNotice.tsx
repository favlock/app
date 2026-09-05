import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CloudOff, TriangleAlert, WifiOff } from "lucide-react";
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
  const offline = cloudStatus === "offline";
  const needsAttention = cloudStatus === "restricted" || cloudStatus === "reconnect_required" || Boolean(connectionError);
  const Icon = offline ? WifiOff : needsAttention ? TriangleAlert : CloudOff;
  const title = offline ? "You’re offline" : cloudStatus === "reconnect_required" ? "Reconnect your account" : cloudStatus === "restricted" ? "Cloud access is restricted" : "Cloud connection interrupted";
  return (
    <section aria-label="Cloud connection" className="app-connection-notice m-3 lg:mx-0" data-tone={needsAttention ? "warning" : "info"}>
      <span className="app-connection-notice-icon"><Icon className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <div role="status">
          <p className="font-semibold text-[var(--app-ink)]">{title}</p>
          <p className="mt-1 leading-6">{connectionError || (offline ? "You can browse your saved local library; cloud changes need a connection." : cloudStatusMessage(cloudStatus))}</p>
        </div>
        {error && <p role="alert" className="mt-3 font-medium text-red-800">{error}</p>}
        {!offline && <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} className="app-connection-notice-action disabled:opacity-50" onClick={async () => {
            const nextAttempt: ConnectionAttempt = { scope, pending: true, error: null };
            setAttempt(nextAttempt);
            try {
              await retryCloudConnection();
              setAttempt((current) => current === nextAttempt ? null : current);
            } catch (failure) {
              const message = failure instanceof Error ? failure.message : "Could not connect. Try again later.";
              setAttempt((current) => current === nextAttempt ? { scope, pending: false, error: message } : current);
            }
          }}>{pending ? "Connecting…" : "Try cloud connection"}</button>
          {cloudStatus === "reconnect_required" && <Link className="app-connection-notice-action" to="/login?reconnect=1">Reconnect account</Link>}
          {online && <Link className="app-connection-notice-action" to="/settings#export-data">Export local data</Link>}
        </div>}
      </div>
    </section>
  );
}
