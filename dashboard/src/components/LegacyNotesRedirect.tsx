import { Navigate, useLocation } from "react-router-dom";

export default function LegacyNotesRedirect() {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname: "/write", search, hash }} state={state} replace />;
}
