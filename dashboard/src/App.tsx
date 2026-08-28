import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { EncryptionProvider } from "./context/EncryptionContext";
import UnlockDialog from "./components/UnlockDialog";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicOnlyRoute from "./components/PublicOnlyRoute";
import EncryptionSetup from "./components/EncryptionSetup";
import NewTabLoadingShell from "./components/NewTabLoadingShell";
import LegacyNotesRedirect from "./components/LegacyNotesRedirect";

const AuthPage = lazy(() => import("./pages/Register"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ProCheckout = lazy(() => import("./pages/ProCheckout"));
const DashboardLayout = lazy(() => import("./pages/DashboardLayout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Notes = lazy(() => import("./pages/Notes"));
const Tasks = lazy(() => import("./pages/Todos"));
const Readspace = lazy(() => import("./pages/Readspace"));
const Lists = lazy(() => import("./pages/Lists"));
const Trash = lazy(() => import("./pages/Trash"));
const Settings = lazy(() => import("./pages/Settings"));
const Support = lazy(() => import("./pages/Support"));
const ExtensionPair = lazy(() => import("./pages/ExtensionPair"));

function RouteFallback() {
  if (window.location.pathname === "/") {
    return <NewTabLoadingShell />;
  }

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <EncryptionProvider>
        <AuthProvider>
          <ThemeProvider>
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route
                    path="/login"
                    element={
                      <PublicOnlyRoute>
                        <AuthPage />
                      </PublicOnlyRoute>
                    }
                  />
                  <Route
                    path="/register"
                    element={
                      <Navigate
                        to={`/login${window.location.search}${window.location.hash}`}
                        replace
                      />
                    }
                  />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route
                    path="/extension/pair"
                    element={
                      <ProtectedRoute>
                        <ExtensionPair />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/checkout"
                    element={
                      <ProtectedRoute>
                        <ProCheckout />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    element={
                      <ProtectedRoute>
                        <>
                          <UnlockDialog />
                          <EncryptionSetup />
                          <DashboardLayout />
                        </>
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/c/:collectionSlug" element={<Dashboard />} />
                    <Route path="/t/:tagSlug" element={<Dashboard />} />
                    <Route path="/favorites" element={<Dashboard />} />
                    <Route path="/unsorted" element={<Dashboard />} />
                    <Route path="/write" element={<Notes />} />
                    <Route path="/notes" element={<LegacyNotesRedirect />} />
                    <Route path="/tasks" element={<Tasks />} />
                    <Route
                      path="/todos"
                      element={
                        <Navigate
                          to={`/tasks${window.location.search}${window.location.hash}`}
                          replace
                        />
                      }
                    />
                    <Route path="/readspace" element={<Readspace />} />
                    <Route path="/lists" element={<Lists />} />
                    <Route path="/trash" element={<Trash />} />
                    <Route path="/support" element={<Support />} />
                    <Route path="settings" element={<Settings />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ThemeProvider>
        </AuthProvider>
      </EncryptionProvider>
    </QueryClientProvider>
  );
}

export default App;
