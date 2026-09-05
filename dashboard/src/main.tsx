import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import AppErrorBoundary from "./components/AppErrorBoundary.tsx";

import { initializeAppearance } from "./lib/appearance";

const disposeAppearance = initializeAppearance();
if (import.meta.hot) import.meta.hot.dispose(disposeAppearance);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
