import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getPostAuthPath } from "../lib/authNavigation";

export default function PublicOnlyRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
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

  if (user) {
    return (
      <Navigate
        to={getPostAuthPath(new URLSearchParams(location.search))}
        replace
      />
    );
  }

  return <>{children}</>;
}
