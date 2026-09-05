import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getPostAuthPath } from "../lib/authNavigation";

export default function PublicOnlyRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, cloudStatus, connectionError } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#f7fafc] text-sm font-medium text-[#4f5566]"
        role="status"
        aria-live="polite"
      >
        Loading...
      </div>
    );
  }

  const loginParams = new URLSearchParams(location.search);
  const reconnecting = location.pathname === "/login" &&
    loginParams.get("reconnect") === "1" && cloudStatus !== "available";
  if (user && !reconnecting) {
    return (
      <Navigate
        to={getPostAuthPath(new URLSearchParams(location.search))}
        replace
      />
    );
  }

  return <>
    {connectionError && (
      <section role="alert" aria-label="Account connection" className="mx-auto mt-4 max-w-lg rounded-xl border border-[var(--app-line)] bg-[var(--app-bg)] p-4 text-sm">
        <p>{connectionError}</p>
        <button type="button" className="mt-3 underline" onClick={() => window.location.reload()}>Reload FavLock</button>
      </section>
    )}
    {children}
  </>;
}
