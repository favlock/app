import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { buildAuthPath } from "../lib/authNavigation";
import NewTabLoadingShell from "./NewTabLoadingShell";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, libraryCacheHydrating } = useAuth();
  const location = useLocation();

  if (loading || (!!user && libraryCacheHydrating)) {
    if (window.location.pathname === "/") {
      return <NewTabLoadingShell />;
    }

    return (
      <div
        className="flex justify-center items-center h-screen bg-gray-50  text-gray-600 "
        role="status"
        aria-live="polite"
      >
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    const nextPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={buildAuthPath("/login", nextPath)} replace />;
  }

  return <>{children}</>;
}
